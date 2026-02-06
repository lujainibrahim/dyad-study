const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// ============ SUPABASE LOGGING ============
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lqmacprqbiwwfariawjf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

// Send chat log to Supabase
async function sendChatLogToSupabase(chatLog) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/chat_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        data: chatLog  // Store entire chat log as JSON
      })
    });
    
    if (response.ok || response.status === 201) {
      console.log('Chat log saved to Supabase!');
      return true;
    } else {
      const error = await response.text();
      console.error('Failed to save to Supabase:', response.status, error);
      return false;
    }
  } catch (e) {
    console.error('Error saving to Supabase:', e);
    return false;
  }
}

// Create folders if they don't exist
// Use Railway volume path if available, otherwise local folder
const LOGS_DIR = process.env.LOGS_DIR || '/app/chat_logs';
const SCHEDULE_FILE = path.join(LOGS_DIR, 'scheduled_sessions.json');

// Create logs directory if it doesn't exist
try {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  console.log(`Chat logs will be saved to: ${LOGS_DIR}`);
} catch (e) {
  console.error(`Could not create logs directory: ${e.message}`);
}

const server = http.createServer(app);
const io = new Server(server);

// ============ CONFIGURATION ============
const MIN_MESSAGES = 5;
const MAX_MESSAGES = 10;

// Prolific API Configuration
const PROLIFIC_API_TOKEN = process.env.PROLIFIC_API_TOKEN || 'bYEx2Sv_Cnyhadp2tjA4REuTUO1n7kKO3Kvcje3UEdvi1ht5QZ8-PiQybXuqyrLDxCQAcV4fYFKZumrL7NlDk1nKeii2nh7k_4NZhYz1IHNEORwiVBhe7h2n';
const PROLIFIC_STUDY_IDS = {
  A: '6968270c3c49d3e7e3271e79',
  B: '69694a9982bb1223cd7331a2'
};
const CHAT_BASE_URL = process.env.CHAT_BASE_URL || 'https://dyad-study-production.up.railway.app';

// ============ SCHEDULING SYSTEM ============

// Load scheduled sessions from file
function loadScheduledSessions() {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading scheduled sessions:', e);
  }
  return { pending: [], matched: [], notified: [] };
}

// Save scheduled sessions to file
function saveScheduledSessions(sessions) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(sessions, null, 2));
}

// Send Prolific message to participant
async function sendProlificMessage(studyId, participantId, message) {
  try {
    const response = await fetch(`https://api.prolific.com/api/v1/studies/${studyId}/messages/`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${PROLIFIC_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient_id: participantId,
        body: message
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Prolific API error: ${error}`);
      return false;
    }
    
    console.log(`Message sent to ${participantId} in study ${studyId}`);
    return true;
  } catch (e) {
    console.error('Error sending Prolific message:', e);
    return false;
  }
}

// Check for scheduled sessions and send notifications
async function checkScheduledSessions() {
  const sessions = loadScheduledSessions();
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
  
  // Try to match pending participants
  const pendingA = sessions.pending.filter(p => p.type === 'A');
  const pendingB = sessions.pending.filter(p => p.type === 'B');
  
  for (const partA of pendingA) {
    // Find a B partner with a matching time (within 5 minutes)
    const partATime = new Date(partA.scheduledTime);
    const matchingB = pendingB.find(b => {
      const partBTime = new Date(b.scheduledTime);
      return Math.abs(partATime - partBTime) <= 5 * 60 * 1000; // Within 5 minutes
    });
    
    if (matchingB) {
      // Create a matched pair
      const matchTime = new Date(Math.max(partATime, new Date(matchingB.scheduledTime)));
      sessions.matched.push({
        partnerA: partA,
        partnerB: matchingB,
        scheduledTime: matchTime.toISOString(),
        notified: false
      });
      
      // Remove from pending
      sessions.pending = sessions.pending.filter(p => 
        p.odId !== partA.prolificId && p.prolificId !== matchingB.prolificId
      );
      
      console.log(`Matched ${partA.prolificId} (A) with ${matchingB.prolificId} (B) for ${matchTime}`);
    }
  }
  
  // Check matched pairs for notification time
  for (const match of sessions.matched) {
    if (match.notified) continue;
    
    const scheduledTime = new Date(match.scheduledTime);
    
    // Send notification 5 minutes before scheduled time
    if (scheduledTime <= fiveMinutesFromNow && scheduledTime > now) {
      const chatLinkA = `${CHAT_BASE_URL}/?PROLIFIC_PID=${match.partnerA.prolificId}&type=A`;
      const chatLinkB = `${CHAT_BASE_URL}/?PROLIFIC_PID=${match.partnerB.prolificId}&type=B`;
      
      const messageA = `Your chat session is starting soon! Please click this link to join the chat room: ${chatLinkA}`;
      const messageB = `Your chat session is starting soon! Please click this link to join the chat room: ${chatLinkB}`;
      
      await sendProlificMessage(PROLIFIC_STUDY_IDS.A, match.partnerA.prolificId, messageA);
      await sendProlificMessage(PROLIFIC_STUDY_IDS.B, match.partnerB.prolificId, messageB);
      
      match.notified = true;
      sessions.notified.push({
        ...match,
        notifiedAt: new Date().toISOString()
      });
      
      console.log(`Notified pair: ${match.partnerA.prolificId} & ${match.partnerB.prolificId}`);
    }
  }
  
  // Clean up old matched sessions that have been notified
  sessions.matched = sessions.matched.filter(m => !m.notified);
  
  saveScheduledSessions(sessions);
}

// Run scheduler every minute
setInterval(checkScheduledSessions, 60 * 1000);
console.log('Scheduler started - checking every minute for scheduled sessions');

// Fixed completion code for all participants
const COMPLETION_CODE = 'CHAT-DYAD2026';

function generateCompletionCode() {
  return COMPLETION_CODE;
}

// In-memory storage
// Separate waiting rooms: A waits for B, B waits for A
const waitingRoomA = [];          // Type A participants waiting for a Type B partner
const waitingRoomB = [];          // Type B participants waiting for a Type A partner
const activePairs = new Map();    // pairId -> { participants: [socket1, socket2], prolificIds: [id1, id2] }
const socketToPair = new Map();   // socketId -> pairId
const waitingTimeouts = new Map(); // socketId -> timeout

// Waiting room timeout (5 minutes)
const WAITING_TIMEOUT_MS = 5 * 60 * 1000;

app.use(express.static(path.join(__dirname, 'public')));

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to get config
app.get('/api/config', (req, res) => {
  res.json({ minMessages: MIN_MESSAGES, maxMessages: MAX_MESSAGES });
});

// ============ SCHEDULING API ENDPOINTS ============

// Register a participant for a scheduled session
// Called from Qualtrics when participant picks a time
app.post('/api/schedule', (req, res) => {
  const { prolificId, type, scheduledTime } = req.body;
  
  if (!prolificId || !type || !scheduledTime) {
    return res.status(400).json({ error: 'Missing required fields: prolificId, type, scheduledTime' });
  }
  
  if (!['A', 'B'].includes(type)) {
    return res.status(400).json({ error: 'Type must be A or B' });
  }
  
  const sessions = loadScheduledSessions();
  
  // Check if already registered
  const existing = sessions.pending.find(p => p.prolificId === prolificId);
  if (existing) {
    existing.scheduledTime = scheduledTime;
    existing.updatedAt = new Date().toISOString();
  } else {
    sessions.pending.push({
      prolificId,
      type,
      scheduledTime,
      registeredAt: new Date().toISOString()
    });
  }
  
  saveScheduledSessions(sessions);
  
  console.log(`Scheduled ${prolificId} (Type ${type}) for ${scheduledTime}`);
  res.json({ success: true, message: 'Session scheduled' });
});

// Get available time slots (for the next 7 days)
app.get('/api/timeslots', (req, res) => {
  const slots = [];
  const now = new Date();
  
  // Generate hourly slots for next 7 days (9 AM to 9 PM)
  for (let day = 0; day < 7; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);
    
    for (let hour = 9; hour <= 21; hour++) {
      date.setHours(hour, 0, 0, 0);
      if (date > now) {
        slots.push({
          time: date.toISOString(),
          label: date.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric',
            minute: '2-digit'
          })
        });
      }
    }
  }
  
  res.json({ slots });
});

// Admin endpoint to view scheduled sessions
app.get('/api/admin/sessions', (req, res) => {
  const sessions = loadScheduledSessions();
  res.json(sessions);
});

// Admin endpoint to manually trigger a check
app.post('/api/admin/check', async (req, res) => {
  await checkScheduledSessions();
  res.json({ success: true, message: 'Check completed' });
});

// Download all chat logs
app.get('/api/admin/logs', (req, res) => {
  try {
    const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'));
    const logs = files.map(f => {
      const content = fs.readFileSync(path.join(LOGS_DIR, f), 'utf8');
      return JSON.parse(content);
    });
    res.json({ count: logs.length, logs });
  } catch (e) {
    res.json({ count: 0, logs: [], error: e.message });
  }
});

// Check waiting room status
app.get('/api/admin/status', (req, res) => {
  res.json({
    waitingRoomA: waitingRoomA.length,
    waitingRoomB: waitingRoomB.length,
    activePairs: activePairs.size,
    waitingA: waitingRoomA.map(w => ({ prolificId: w.prolificId, type: w.participantType })),
    waitingB: waitingRoomB.map(w => ({ prolificId: w.prolificId, type: w.participantType }))
  });
});

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Participant joins with their Prolific ID and type (A or B)
  socket.on('join', ({ prolificId, participantType }) => {
    const type = participantType || 'A'; // Default to A if not specified
    console.log(`Participant joined: ${prolificId} (Type ${type})`);
    
    // Determine which waiting room to check and which to join
    // Type A looks for Type B partners, and vice versa
    const partnerWaitingRoom = type === 'A' ? waitingRoomB : waitingRoomA;
    const myWaitingRoom = type === 'A' ? waitingRoomA : waitingRoomB;
    
    // Check if a partner of the opposite type is waiting
    if (partnerWaitingRoom.length > 0) {
      // Match with the first waiting partner of opposite type
      const partner = partnerWaitingRoom.shift();
      
      // Clear partner's waiting timeout since they're now matched
      if (waitingTimeouts.has(partner.socket.id)) {
        clearTimeout(waitingTimeouts.get(partner.socket.id));
        waitingTimeouts.delete(partner.socket.id);
      }
      
      // Create a unique pair ID
      const pairId = `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the pair with participant types
      activePairs.set(pairId, {
        participants: [partner.socket, socket],
        prolificIds: [partner.prolificId, prolificId],
        participantTypes: [partner.participantType, type],
        messages: [],
        finishedCount: 0,
        startTime: new Date().toISOString()
      });
      
      socketToPair.set(partner.socket.id, pairId);
      socketToPair.set(socket.id, pairId);
      
      // Notify both participants they're matched
      // Include their type so frontend knows if they're A or B
      partner.socket.emit('matched', { 
        pairId, 
        partnerNumber: 2,
        yourNumber: 1,
        yourType: partner.participantType
      });
      socket.emit('matched', { 
        pairId, 
        partnerNumber: 1,
        yourNumber: 2,
        yourType: type
      });
      
      console.log(`Pair created: ${pairId} with ${partner.prolificId} (Type ${partner.participantType}) and ${prolificId} (Type ${type})`);
    } else {
      // Add to my waiting room (waiting for opposite type)
      myWaitingRoom.push({ socket, prolificId, participantType: type });
      socket.emit('waiting');
      console.log(`${prolificId} (Type ${type}) added to waiting room. Waiting A: ${waitingRoomA.length}, Waiting B: ${waitingRoomB.length}`);
      
      // Set timeout to expire waiting after 5 minutes
      const timeoutId = setTimeout(() => {
        // Check if still in waiting room
        const inWaitingA = waitingRoomA.findIndex(w => w.socket.id === socket.id);
        const inWaitingB = waitingRoomB.findIndex(w => w.socket.id === socket.id);
        
        if (inWaitingA !== -1) {
          waitingRoomA.splice(inWaitingA, 1);
          socket.emit('waitingTimeout');
          console.log(`${prolificId} (Type ${type}) timed out waiting. Removed from waiting room.`);
        } else if (inWaitingB !== -1) {
          waitingRoomB.splice(inWaitingB, 1);
          socket.emit('waitingTimeout');
          console.log(`${prolificId} (Type ${type}) timed out waiting. Removed from waiting room.`);
        }
        
        waitingTimeouts.delete(socket.id);
      }, WAITING_TIMEOUT_MS);
      
      waitingTimeouts.set(socket.id, timeoutId);
    }
  });

  // Handle chat messages
  socket.on('message', (text) => {
    const pairId = socketToPair.get(socket.id);
    if (!pairId) return;
    
    const pair = activePairs.get(pairId);
    if (!pair) return;
    
    // Find which participant number this is
    const senderIndex = pair.participants.findIndex(p => p.id === socket.id);
    const senderNumber = senderIndex + 1;
    const senderType = pair.participantTypes[senderIndex];
    
    // Track messages per participant
    if (!pair.messageCounts) {
      pair.messageCounts = [0, 0];
    }
    
    // Person B can only send after Person A sends first
    if (senderType === 'B' && !pair.aHasSentFirst) {
      socket.emit('waitForA');
      return;
    }
    
    // Block if sender already hit max
    if (pair.messageCounts[senderIndex] >= MAX_MESSAGES) {
      socket.emit('maxReached');
      return;
    }
    
    const messageData = {
      text,
      sender: senderNumber,
      timestamp: Date.now()
    };
    
    pair.messages.push(messageData);
    pair.messageCounts[senderIndex]++;
    
    // Track if A has sent their first message (to unlock B)
    if (senderType === 'A' && !pair.aHasSentFirst) {
      pair.aHasSentFirst = true;
      // Notify B that they can now send
      pair.participants.forEach((p, idx) => {
        if (pair.participantTypes[idx] === 'B') {
          p.emit('aStarted');
        }
      });
    }
    
    // Check if BOTH participants have sent at least MIN_MESSAGES each
    const canFinish = pair.messageCounts[0] >= MIN_MESSAGES && pair.messageCounts[1] >= MIN_MESSAGES;
    const wasAbleToFinish = (pair.messageCounts[0] - (senderIndex === 0 ? 1 : 0)) >= MIN_MESSAGES && 
                            (pair.messageCounts[1] - (senderIndex === 1 ? 1 : 0)) >= MIN_MESSAGES;
    
    // Check if both hit max - auto finish
    const bothAtMax = pair.messageCounts[0] >= MAX_MESSAGES && pair.messageCounts[1] >= MAX_MESSAGES;
    
    // Send to both participants with message counts
    pair.participants.forEach((p, idx) => {
      p.emit('message', { 
        ...messageData, 
        yourMessageCount: pair.messageCounts[idx],
        partnerMessageCount: pair.messageCounts[1 - idx],
        canFinish,
        yourMaxReached: pair.messageCounts[idx] >= MAX_MESSAGES,
        bothAtMax
      });
    });
    
    // Notify when both reach minimum for the first time
    if (canFinish && !wasAbleToFinish) {
      pair.participants.forEach(p => {
        p.emit('canFinish');
      });
    }
  });

  // Handle "finished" button click
  socket.on('finished', () => {
    const pairId = socketToPair.get(socket.id);
    if (!pairId) return;
    
    const pair = activePairs.get(pairId);
    if (!pair) return;
    
    pair.finishedCount++;
    
    // Find which participant this is
    const finisherIndex = pair.participants.findIndex(p => p.id === socket.id);
    
    // Notify both that someone clicked finish
    pair.participants.forEach((p, idx) => {
      if (idx === finisherIndex) {
        p.emit('youFinished');
      } else {
        p.emit('partnerFinished');
      }
    });
    
    // If both finished, save chat and redirect both
    if (pair.finishedCount >= 2) {
      // Save chat log to file
      const chatLog = {
        pairId,
        participants: pair.prolificIds.map((id, idx) => ({
          prolificId: id,
          type: pair.participantTypes[idx],
          completionCode: generateCompletionCode()
        })),
        startTime: pair.startTime,
        endTime: new Date().toISOString(),
        messageCount: pair.messages.length,
        messages: pair.messages.map(m => ({
          ...m,
          senderProlificId: pair.prolificIds[m.sender - 1],
          senderType: pair.participantTypes[m.sender - 1],
          timestamp: new Date(m.timestamp).toISOString()
        }))
      };
      
      const filename = `${pairId}.json`;
      fs.writeFileSync(
        path.join(LOGS_DIR, filename),
        JSON.stringify(chatLog, null, 2)
      );
      console.log(`Chat log saved: ${filename}`);
      
      // Also log full chat to console (visible in Railway logs)
      console.log('=== CHAT LOG START ===');
      console.log(JSON.stringify(chatLog, null, 2));
      console.log('=== CHAT LOG END ===');
      
      // Send chat log to Supabase
      sendChatLogToSupabase(chatLog).catch(err => console.error('Supabase error:', err));
      
      pair.participants.forEach((p, idx) => {
        const prolificId = pair.prolificIds[idx];
        const completionCode = generateCompletionCode();
        p.emit('complete', { prolificId, completionCode });
      });
      
      // Clean up
      pair.participants.forEach(p => socketToPair.delete(p.id));
      activePairs.delete(pairId);
      
      console.log(`Pair ${pairId} completed conversation`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    
    // Clear any waiting timeout
    if (waitingTimeouts.has(socket.id)) {
      clearTimeout(waitingTimeouts.get(socket.id));
      waitingTimeouts.delete(socket.id);
    }
    
    // Remove from waiting room A if there
    const waitingIndexA = waitingRoomA.findIndex(w => w.socket.id === socket.id);
    if (waitingIndexA !== -1) {
      waitingRoomA.splice(waitingIndexA, 1);
      console.log(`Removed from waiting room A. Waiting A: ${waitingRoomA.length}, Waiting B: ${waitingRoomB.length}`);
      return;
    }
    
    // Remove from waiting room B if there
    const waitingIndexB = waitingRoomB.findIndex(w => w.socket.id === socket.id);
    if (waitingIndexB !== -1) {
      waitingRoomB.splice(waitingIndexB, 1);
      console.log(`Removed from waiting room B. Waiting A: ${waitingRoomA.length}, Waiting B: ${waitingRoomB.length}`);
      return;
    }
    
    // Notify partner if in active pair
    const pairId = socketToPair.get(socket.id);
    if (pairId) {
      const pair = activePairs.get(pairId);
      if (pair) {
        pair.participants.forEach(p => {
          if (p.id !== socket.id) {
            p.emit('partnerDisconnected');
          }
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Participants should join with: http://localhost:${PORT}?PROLIFIC_PID=their_id`);
});
