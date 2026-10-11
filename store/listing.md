# Chrome Web Store listing: Hush - PII Guard

Copy each section into the matching field in the developer dashboard.

---

## Name

Hush - PII Guard

## Summary (short description, 132 characters max)

Hides names, phone numbers, emails and other personal info from ChatGPT and Claude. Redacts on your device, restores in replies.

## Category

Privacy & Security

## Description

Talk to AI without handing over your personal details.

Hush finds personal information in your message, such as names, phone numbers, emails, addresses and ID numbers, and swaps it for placeholders before the message is sent. ChatGPT or Claude sees "[GIVEN_NAME_1]", not your name. When the reply comes back, Hush puts the real values back on your screen, so the conversation still reads naturally.

Everything happens on your device. Hush has no servers, no account and no tracking.

HOW IT WORKS
• As you type, detected items are highlighted in green.
• When you send, they are replaced with placeholders like [PHONE_1].
• In the conversation, placeholders are shown with the real values, lightly tinted so you can tell which ones were protected.
• Hover any highlight to see exactly what the AI will receive, or received.

YOU STAY IN CONTROL
• On/off switch on the page: when off, items are only highlighted and your message is sent as typed.
• "Don't redact": hover an item and keep it as typed, for example a public figure's name.
• Eye button: switch the page between real values and placeholders to see exactly what the AI saw.
• Works in the main message box and when editing an earlier message.
• Attached files are checked too: text files, PDFs and Word documents with personal information can be attached as a redacted copy, as the original, or not at all.
• If redaction fails for any reason, the message is not sent.

WHAT IT DETECTS
First and last names, phone numbers, email addresses, web addresses, street addresses, Social Security numbers, credit card numbers, bank account and routing numbers, tax IDs, passport and driver's license numbers, other government IDs, and IP addresses. By default, the city, state and ZIP code are kept, so the AI can still help with location questions.

PRIVATE BY DESIGN
• Detection runs in your browser using a small on-device model (about 15 MB, downloaded once).
• Saved placeholder values are encrypted on your device and can be viewed or deleted from the settings page at any time.
• Uses WebGPU for speed when your graphics card supports it, and falls back to the CPU otherwise.

GOOD TO KNOW
• Works on chatgpt.com and claude.ai.
• Images, spreadsheets and voice input are not checked. A redacted PDF or Word file is attached as plain text.
• No detector catches everything; Hush reduces what you share but can't guarantee it catches every item.
• Best for names and text in Latin-script languages (English, Spanish, French, German, Italian, Portuguese, Dutch).

Detection is powered by Rampart from National Design Studio (github.com/nationaldesignstudio/rampart), licensed CC BY 4.0.

Hush is an independent project and is not affiliated with OpenAI or Anthropic. ChatGPT is a trademark of OpenAI; Claude is a trademark of Anthropic.

---

## Privacy tab

### Single purpose

Hush redacts personal information from messages before they are sent to ChatGPT or Claude, and shows the real values again in the conversation on the user's own screen.

### Permission justifications

**storage**
Saves the user's settings and, for each conversation, the placeholders used and the values they replace (encrypted on the device), so placeholders in replies can be shown as the real values after a page reload.

**offscreen**
Runs the on-device personal-information detection model in an offscreen document, so a single copy of the model serves every tab and inference doesn't run inside the chat pages.

**Host permissions (chatgpt.com, chat.openai.com, claude.ai)**
The content script must read the message box to detect personal information, replace it with placeholders before the message is sent, and swap placeholders in the conversation back to the real values on screen. It runs on these sites only.

### Remote code

No, I am not using remote code. All JavaScript and WebAssembly (including ONNX Runtime) is included in the package. The detection model's weights are downloaded from Hugging Face on first use; they are data loaded by the bundled runtime, not executable code.

### Data usage

**What user data does the extension collect?** Tick:
- Personally identifiable information. Hush reads the text the user types in order to detect and redact personal information. This is processed on the device only and is never transmitted to the developer or any third party.
- Website content. Hush reads the conversation text on the supported sites to show real values in place of placeholders. Processed on the device only.

**Certifications.** Tick all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy URL

Paste the address where you published `store/privacy-policy.md`.

---

## Screenshot ideas (1280×800)

1. The ChatGPT message box with a name and phone number highlighted in green, and the "Hush · 3 to redact" control visible.
2. The hover card over a highlight: "First name · will be redacted. The AI will see [GIVEN_NAME_1] instead."
3. A reply showing tinted real values, with the hover card "Real value, shown only on this device. The AI received [SURNAME_1]."
4. The settings page: model status, backend and a saved conversation with its values shown.
