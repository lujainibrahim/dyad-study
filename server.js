const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();

// Create chat_logs folder if it doesn't exist
const LOGS_DIR = path.join(__dirname, 'chat_logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}
const server = http.createServer(app);
const io = new Server(server);

// Configuration - UPDATE THIS URL
const COMPLETION_QUALTRICS_URL = 'https://yourschool.qualtrics.com/jfe/form/YOUR_SURVEY_ID';

// In-memory storage
const waitingRoom = [];           // Participants waiting for a partner
const activePairs = new Map();    // pairId -> { participants: [socket1, socket2], prolificIds: [id1, id2] }
const socketToPair = new Map();   // socketId -> pairId

app.use(express.static(path.join(__dirname, 'public')));

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to get completion URL (so we can configure it in one place)
app.get('/api/config', (req, res) => {
  res.json({ completionUrl: COMPLETION_QUALTRICS_URL });
});

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Participant joins with their Prolific ID
  socket.on('join', (prolificId) => {
    console.log(`Participant joined: ${prolificId}`);
    
    // Check if someone is already waiting
    if (waitingRoom.length > 0) {
      // Match with the first waiting participant
      const partner = waitingRoom.shift();
      
      // Create a unique pair ID
      const pairId = `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the pair
      activePairs.set(pairId, {
        participants: [partner.socket, socket],
        prolificIds: [partner.prolificId, prolificId],
        messages: [],
        finishedCount: 0,
        startTime: new Date().toISOString()
      });
      
      socketToPair.set(partner.socket.id, pairId);
      socketToPair.set(socket.id, pairId);
      
      // Notify both participants they're matched
      partner.socket.emit('matched', { 
        pairId, 
        partnerNumber: 2,
        yourNumber: 1
      });
      socket.emit('matched', { 
        pairId, 
        partnerNumber: 1,
        yourNumber: 2
      });
      
      console.log(`Pair created: ${pairId} with ${partner.prolificId} and ${prolificId}`);
    } else {
      // Add to waiting room
      waitingRoom.push({ socket, prolificId });
      socket.emit('waiting');
      console.log(`${prolificId} added to waiting room. Waiting: ${waitingRoom.length}`);
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
    
    const messageData = {
      text,
      sender: senderNumber,
      timestamp: Date.now()
    };
    
    pair.messages.push(messageData);
    
    // Send to both participants
    pair.participants.forEach(p => {
      p.emit('message', messageData);
    });
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
        prolificIds: pair.prolificIds,
        startTime: pair.startTime,
        endTime: new Date().toISOString(),
        messageCount: pair.messages.length,
        messages: pair.messages.map(m => ({
          ...m,
          senderProlificId: pair.prolificIds[m.sender - 1],
          timestamp: new Date(m.timestamp).toISOString()
        }))
      };
      
      const filename = `${pairId}.json`;
      fs.writeFileSync(
        path.join(LOGS_DIR, filename),
        JSON.stringify(chatLog, null, 2)
      );
      console.log(`Chat log saved: ${filename}`);
      
      pair.participants.forEach((p, idx) => {
        const prolificId = pair.prolificIds[idx];
        p.emit('complete', { prolificId });
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
    
    // Remove from waiting room if there
    const waitingIndex = waitingRoom.findIndex(w => w.socket.id === socket.id);
    if (waitingIndex !== -1) {
      waitingRoom.splice(waitingIndex, 1);
      console.log(`Removed from waiting room. Waiting: ${waitingRoom.length}`);
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
