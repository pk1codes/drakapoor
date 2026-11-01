# Dr Anuradha Kapoor

Public page: https://pk1codes.github.io/drakapoor/

Picture-first page for patients of Dr Anuradha Kapoor, diabetologist at Lifeline Hospital, Vishal Complex, Malad West, Mumbai.

## What a patient does

1. Choose English, Hindi, Marathi, or Gujarati.
2. Pick a day, then a 15-minute time.
3. Enter a name and mobile number.
4. Send the WhatsApp message that opens on their own phone.

Monday to Friday, 12:00–6:00 India time. The last start is 5:45. Saturday and Sunday show as closed. Times before 12:00 and after 6:00 show as busy. Patients can request a time in the next 28 days.

The message goes to +91 98203 81015. Reply on WhatsApp to confirm. If that time is taken, reply with another time. The page does not hold the slot.

Online consult uses the same times. The talk happens on WhatsApp after you confirm.

## Change hours, phone, or the pin

Edit `clinic.js`, then commit and push to `main`. GitHub Pages updates from that branch.

- `openHour` / `closeHour` — visit window. Slots start every `slotMinutes` and the last one ends at `closeHour`.
- `openDays` — 0 is Sunday, 1 is Monday, through 6 Saturday.
- `whatsapp` — country code and number, no plus sign.
- `lat` / `lng` / `address` — the map pin.
