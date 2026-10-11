# Hush - PII Guard: Privacy Policy

_Effective October 11, 2026_

Hush - PII Guard ("Hush") is a browser extension that removes personal
information from your messages before they are sent to ChatGPT or Claude. It is
built so that the personal information it handles never leaves your device.

## The short version

- Hush does all of its work **on your device**.
- Hush has **no servers**. It does not collect, sell, share or transmit your
  data to us or anyone else.
- Hush contains **no analytics, tracking or advertising**.
- The only network request Hush makes itself is a one-time download of its
  detection model from Hugging Face. That request contains none of your text.

## What Hush reads

Hush runs only on `chatgpt.com`, `chat.openai.com` and `claude.ai`. On those
sites it reads:

- **The text you type** in the message box and in "edit message" boxes, to find
  personal information such as names, phone numbers, email addresses and ID numbers.
- **Files you attach** (text files, PDFs and Word documents), when file
  scanning is on, to find the same kinds of personal information before the
  site receives them. Their text is read in memory and is never stored.
- **The text of the conversation on the page**, to find placeholders (for
  example `[GIVEN_NAME_1]`) and show you the real values in their place.

All detection runs locally in your browser, using a machine-learning model and
pattern rules that run on your own computer.

## What Hush stores, and where

Everything Hush stores stays in your browser's local extension storage on your
device:

| Data | Why | How it is stored |
| --- | --- | --- |
| Settings (on/off, show real values, file scanning, model backend, position of the on-page control) | To remember your choices | Plain text |
| For each conversation: the placeholders used and the real values they stand for, plus any items you chose not to redact | So placeholders in replies can be shown as the real values, including after a reload | Encrypted with AES-GCM, using a key that cannot be exported from the extension |
| For each conversation: the site, conversation ID, number of saved values and last-updated time | To list your saved conversations on the settings page | Plain text |
| The detection model files | So the model is downloaded only once | Browser cache |

Hush never stores your messages themselves, only the individual values it replaced.

The encryption keeps plain-text personal information out of your browser's
storage files. It does not protect against malicious software that is already
running inside your browser profile.

## Network requests

On first use, Hush downloads its detection model (about 15 MB) from Hugging
Face (`huggingface.co` and its content-delivery servers). These requests contain
no text you have typed and no personal information. As with any download,
Hugging Face receives standard request information such as your IP address. Its
handling of that is covered by the
[Hugging Face privacy policy](https://huggingface.co/privacy).

Hush makes no other network requests.

## What ChatGPT and Claude receive

Hush changes what you send; it does not stop you from using these services.
When Hush is on, the service receives your message with the detected personal
information replaced by placeholders. The service still receives, as normal:

- the rest of your message,
- anything you chose not to redact, or anything sent while Hush is switched off,
- attached files you chose to send as originals, and images, spreadsheets,
  voice input and other files Hush does not check,
- any personal information Hush failed to detect. No detector catches everything.

Your use of those services is governed by the privacy policies of OpenAI and
Anthropic. Hush is not affiliated with OpenAI or Anthropic.

## Your control over your data

- **View** saved values: open Hush's settings page (the Hush toolbar icon, or
  the gear on the on-page control) and choose "Show values" on a conversation.
- **Delete** saved values for one conversation, or all of them, on the same page.
- **Remove everything**: uninstalling Hush deletes all of its stored data from
  your browser.

## Children

Hush does not knowingly collect any information from anyone, including children.

## Changes to this policy

If this policy changes, the new version will be published at this address with
a new effective date. Any change to how data is handled will also be described
in the extension's release notes.

## Contact

Questions about this policy: [your contact email]

---

Hush's detection is powered by
[Rampart](https://github.com/nationaldesignstudio/rampart) from National Design
Studio, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
