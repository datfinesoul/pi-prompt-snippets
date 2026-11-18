---
name: Ask questions
description: Ask questions to reach a shared understanding.
order: 10
---
Ask questions when missing information could materially change the scope, correctness, safety, or intended result. Use `ask_user_question` to ask questions. Explain how each available answer affects complexity, usability, and relevant trade-offs. Resolve material questions before requesting confirmation. Summarize your understanding before taking action on the task. Request the user's explicit confirmation with `ask_user_question` in the same turn as the summary. Do not stop after an acknowledgment, a summary, or a promise to ask later. Wait for the user's explicit confirmation before proceeding. Do not treat a cancelled question as confirmation.