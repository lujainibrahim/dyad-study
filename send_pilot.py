#!/usr/bin/env python3
"""
Pilot session - sends invites to both pairs at scheduled times.
"""

import requests
import time
from datetime import datetime
import pytz

# ============ CONFIGURATION ============
PROLIFIC_API_TOKEN = "bYEx2Sv_Cnyhadp2tjA4REuTUO1n7kKO3Kvcje3UEdvi1ht5QZ8-PiQybXuqyrLDxCQAcV4fYFKZumrL7NlDk1nKeii2nh7k_4NZhYz1IHNEORwiVBhe7h2n"

STUDY_ID_A = "6968270c3c49d3e7e3271e79"
STUDY_ID_B = "69694a9982bb1223cd7331a2"

QUALTRICS_SURVEY_A = "https://nyu.qualtrics.com/jfe/form/SV_a4BOGeGtMRBtPv0"
QUALTRICS_SURVEY_B = "https://nyu.qualtrics.com/jfe/form/SV_0VzkNn3tgCcKD7U"

# ============ PILOT PAIRS ============
# Both sessions are at 8 PM EST (= 7 PM CST)
PAIRS = [
    {
        "name": "Pair 1",
        "partner_a": "694636f370c058c438c1dc5e",
        "partner_b": "695f9adb2064ccdd40b77cdd",
    },
    {
        "name": "Pair 2", 
        "partner_a": "6744fb5c6a8a3d8e3f531da3",
        "partner_b": "66293af123d55f1dadad5ceb",
    }
]

# ============ FUNCTIONS ============

def send_prolific_message(study_id, participant_id, message):
    """Send a message to a participant via Prolific API."""
    url = "https://api.prolific.com/api/v1/messages/"
    headers = {
        "Authorization": f"Token {PROLIFIC_API_TOKEN}",
        "Content-Type": "application/json"
    }
    data = {
        "study_id": study_id,
        "recipient_id": participant_id,
        "body": message
    }
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.ok or response.status_code == 200 or response.status_code == 201:
        print(f"  ✅ Message sent to {participant_id}")
        return True
    else:
        print(f"  ❌ Failed to send to {participant_id}: {response.status_code} - {response.text}")
        return False


def send_invites_to_pair(pair):
    """Send survey invites to a pair."""
    
    link_a = f"{QUALTRICS_SURVEY_A}?PROLIFIC_PID={pair['partner_a']}"
    link_b = f"{QUALTRICS_SURVEY_B}?PROLIFIC_PID={pair['partner_b']}"
    
    message_a = f"""Hi! Your study session should start soon.

Please click the link below to begin:
{link_a}

You'll first interact with an AI chatbot, then chat with your partner. The whole session takes about 15-20 minutes."""

    message_b = f"""Hi! Your study session should start soon.

Please click the link below to begin:
{link_b}

Note: Your partner needs to complete a short task before joining the chat room, so you may need to wait 3-5 minutes in the waiting room. Please be patient - they will join you shortly!

The whole session takes about 15-20 minutes."""

    print(f"\n📤 {pair['name']}:")
    print(f"   Partner A: {pair['partner_a']}")
    print(f"   Partner B: {pair['partner_b']}")
    
    send_prolific_message(STUDY_ID_A, pair['partner_a'], message_a)
    send_prolific_message(STUDY_ID_B, pair['partner_b'], message_b)


# ============ MAIN ============

if __name__ == "__main__":
    import sys
    
    print("=" * 50)
    print("  PILOT SESSION - DYAD CHAT INVITES")
    print("=" * 50)
    
    # Get current time in EST
    est = pytz.timezone('US/Eastern')
    now_est = datetime.now(est)
    
    print(f"\nCurrent time (EST): {now_est.strftime('%I:%M %p')}")
    print(f"Pairs to notify: {len(PAIRS)}")
    
    # Check for command line argument
    if len(sys.argv) > 1:
        choice = sys.argv[1]
        print(f"\nRunning with option: {choice}")
    else:
        print("\nOptions:")
        print("  1. Send NOW (to all pairs)")
        print("  2. Wait until 8:00 PM EST, then send")
        print("  3. Send to specific pair only")
        choice = input("\nChoice: ").strip()
    
    if choice == "1":
        print(f"\n🚀 Sending invites NOW at {now_est.strftime('%I:%M:%S %p EST')}...")
        for pair in PAIRS:
            send_invites_to_pair(pair)
        print("\n🎉 All invites sent!")
        
    elif choice == "2":
        # Calculate time until 8 PM EST today
        target = now_est.replace(hour=20, minute=0, second=0, microsecond=0)
        
        if target <= now_est:
            print("\n⚠️  8 PM EST has already passed today!")
        else:
            wait_seconds = (target - now_est).total_seconds()
            wait_minutes = int(wait_seconds / 60)
            
            print(f"\n⏰ Waiting until 8:00 PM EST ({wait_minutes} minutes from now)...")
            print("   (Keep this terminal open! Press Ctrl+C to cancel)")
            
            time.sleep(wait_seconds)
            
            print(f"\n🚀 It's 8 PM EST! Sending invites...")
            for pair in PAIRS:
                send_invites_to_pair(pair)
            print("\n🎉 All invites sent!")
            
    elif choice == "3":
        print("\nWhich pair?")
        for i, pair in enumerate(PAIRS, 1):
            print(f"  {i}. {pair['name']} (A: {pair['partner_a'][:8]}..., B: {pair['partner_b'][:8]}...)")
        
        pair_choice = int(input("\nPair number: ").strip()) - 1
        if 0 <= pair_choice < len(PAIRS):
            send_invites_to_pair(PAIRS[pair_choice])
            print("\n🎉 Invite sent!")
        else:
            print("Invalid pair number")
    else:
        print("Invalid choice")
