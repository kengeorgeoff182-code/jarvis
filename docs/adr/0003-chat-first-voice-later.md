# ADR-0003: Chat-first product, voice as a later module

Status: Accepted (phase 1)

## Context

"Jarvis" evokes a voice assistant, but voice (wake word, STT, TTS, audio
pipeline, latency budget) roughly doubles the moving parts and the testing
surface. No requirements document exists; the product direction was set by
default in planning (user did not answer the scoping question).

## Decision

- Phase 1–2 build a **chat-first** assistant: text conversation with an LLM
  backend.
- The architecture reserves explicit **ports** for speech-to-text and
  text-to-speech so voice can be added as adapters later without reshaping
  the conversation service. Nothing voice-specific is implemented now.

## Consequences

- A genuinely production-quality chat core (validation, errors, streaming,
  persistence) lands first; voice becomes an input/output swap rather than
  a rewrite.
- Risk: if the eventual product is voice-centric, chat UI work is still
  reusable (session management, history, LLM plumbing).
- Revisit this ADR when the first voice prototype is scoped; it may deserve
  its own ADR for audio transport (WebSocket vs SSE vs WebRTC).
