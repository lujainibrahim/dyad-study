#!/usr/bin/env python3
"""
Simple script to send Prolific messages to paired participants before their chat session.
Run this a few minutes before the scheduled time, or schedule it with cron/launchd.
"""

import requests
import time
from datetime import datetime

# ============ CONFIGURATION ============
PROLIFIC_API_TOKEN = "bYEx2Sv_Cnyhadp2tjA4REuTUO1n7kKO3Kvcje3UEdvi1ht5QZ8-PiQybXuqyrLDxCQAcV4fYFKZumrL7NlDk1nKeii2nh7k_4NZhYz1IHNEORwiVBhe7h2n"

STUDY_ID_A = "6968270c3c49d3e7e3271e79"
STUDY_ID_B = "69694a9982bb1223cd7331a2"

# Qualtrics survey URLs
QUALTRICS_SURVEY_A = "https://nyu.qualtrics.com/jfe/form/SV_a4BOGeGtMRBtPv0"  # Partner A (talks to AI first)
QUALTRICS_SURVEY_B = "https://nyu.qualtrics.com/jfe/form/SV_0VzkNn3tgCcKD7U"  # Partner B (survey only)

# ============ FUNCTIONS ============

def send_prolific_message(study_id, participant_id, message):
    """Send a message to a participant via Prolific API."""
    url = f"https://api.prolific.com/api/v1/studies/{study_id}/messages/"
    headers = {
        "Authorization": f"Token {PROLIFIC_API_TOKEN}",
        "Content-Type": "application/json"
    }
    data = {
        "recipient_id": participant_id,
        "body": message
    }
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.ok:
        print(f"✅ Message sent to {participant_id}")
        return True
    else:
        print(f"❌ Failed to send to {participant_id}: {response.status_code} - {response.text}")
        return False


def send_chat_invites(partner_a_id, partner_b_id):
    """Send survey invites to both partners."""
    
    # Add Prolific ID to the Qualtrics URLs
    link_a = f"{QUALTRICS_SURVEY_A}?PROLIFIC_PID={partner_a_id}"
    link_b = f"{QUALTRICS_SURVEY_B}?PROLIFIC_PID={partner_b_id}"
    
    message_a = f"""Hi! It's time for your study session.

Please click the link below to begin:
{link_a}

You'll first interact with an AI chatbot, then chat with your partner. The whole session takes about 15-20 minutes."""

    message_b = f"""Hi! It's time for your study session.

Please click the link below to begin:
{link_b}

Note: Your partner needs to complete a short task before joining the chat room, so you may need to wait 3-5 minutes in the waiting room. Please be patient - they will join you shortly!

The whole session takes about 15-20 minutes."""

    print(f"\n📤 Sending invites at {datetime.now().strftime('%H:%M:%S')}...")
    print(f"   Partner A: {partner_a_id} -> Qualtrics Survey A (AI chat first)")
    print(f"   Partner B: {partner_b_id} -> Qualtrics Survey B (may wait a few min)\n")
    
    success_a = send_prolific_message(STUDY_ID_A, partner_a_id, message_a)
    success_b = send_prolific_message(STUDY_ID_B, partner_b_id, message_b)
    
    if success_a and success_b:
        print("\n🎉 Both invites sent successfully!")
    else:
        print("\n⚠️  Some invites failed - check above for details")


def send_at_time(partner_a_id, partner_b_id, target_time):
    """Wait until target_time then send invites."""
    
    # Parse target time (format: "HH:MM" or "YYYY-MM-DD HH:MM")
    now = datetime.now()
    
    if len(target_time) <= 5:  # Just time like "14:30"
        hour, minute = map(int, target_time.split(":"))
        target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target < now:
            print("⚠️  That time has already passed today!")
            return
    else:
        target = datetime.strptime(target_time, "%Y-%m-%d %H:%M")
    
    wait_seconds = (target - now).total_seconds()
    
    if wait_seconds > 0:
        print(f"⏰ Waiting until {target.strftime('%H:%M:%S')} ({int(wait_seconds)} seconds)...")
        time.sleep(wait_seconds)
    
    send_chat_invites(partner_a_id, partner_b_id)


# ============ MAIN ============

if __name__ == "__main__":
    print("=" * 50)
    print("  DYAD CHAT INVITE SENDER")
    print("=" * 50)
    
    # Get participant IDs
    partner_a = input("\nEnter Partner A's Prolific ID: ").strip()
    partner_b = input("Enter Partner B's Prolific ID: ").strip()
    
    # Ask when to send
    print("\nWhen should I send the invites?")
    print("  1. Now")
    print("  2. At a specific time (e.g., 14:30)")
    
    choice = input("\nChoice (1 or 2): ").strip()
    
    if choice == "1":
        send_chat_invites(partner_a, partner_b)
    elif choice == "2":
        target = input("Enter time (HH:MM): ").strip()
        send_at_time(partner_a, partner_b, target)
    else:
        print("Invalid choice")
