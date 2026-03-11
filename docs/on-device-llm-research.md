# On-Device LLM Research for Tijuana Claw Fights

## Problem

The game runs on 200ms ticks. An on-device model on iPhone 16 Pro must receive game state, decide an action (one of 7: punch, kick, special, block, jump, move_left, move_right), and send the response — all within 200ms.

## Current Setup

- **iPhone app**: Qwen 3.5 0.6B (4-bit) via llama.cpp
- **Result**: "(waiting)" on most ticks — model is too slow (~270-330ms per response)
- **Server NPC**: Heuristic bot, instant response, no LLM
- **OpenClaw agent**: Claude Haiku via API with 140ms timeout + heuristic fallback

## Latency Breakdown: Qwen3-0.6B Q4 on iPhone 16 Pro (A18 Pro)

| Phase | Estimate |
|---|---|
| WebSocket receive + JSON parse | ~5-10ms |
| Model context setup overhead | ~20-50ms |
| Prompt processing (~100 tokens at ~800 tok/s) | ~125ms |
| Token generation (~10 tokens at ~85 tok/s) | ~118ms |
| JSON serialize + WebSocket send | ~2-5ms |
| **Total** | **~270-330ms** |

**Key insight**: Prompt processing (prefill) is the bottleneck, not generation. Every tick reprocesses the full prompt from scratch.

## On-Device Model Benchmarks (iPhone 16 Pro / A18 Pro)

| Model | Prompt Eval | Generation | Est. Total | Notes |
|---|---|---|---|---|
| Qwen3-0.6B Q4 (llama.cpp) | ~800 tok/s | ~85 tok/s | ~270-330ms | Current setup, too slow |
| TinyLlama 1B Q4 (llama.cpp) | ~648 tok/s | ~70 tok/s | ~300ms+ | Worse than Qwen |
| Phi-2 3B Q4 (llama.cpp) | ~180 tok/s | ~17 tok/s | ~1100ms+ | Way too slow |
| Qwen3-600M (Cactus framework) | optimized | ~70+ tok/s | ~100-130ms | NPU-optimized, fits budget |
| SmolLM2-135M (llama.cpp) | ~2500+ tok/s | ~150+ tok/s | ~60-80ms | Very fast, poor quality |
| Apple Foundation Model (~3B) | 0.6ms/tok | ~30 tok/s | ~225ms | Fast prefill, slow gen |

Source: [llama.cpp A-series benchmarks](https://github.com/ggml-org/llama.cpp/discussions/4508), [Cactus blog](https://huggingface.co/blog/rshemet/cactus-on-device-inference)

## Cloud API Benchmarks (all too slow for 200ms round-trip)

| Model | TTFT | Est. Total | Notes |
|---|---|---|---|
| Claude 4.5 Haiku | ~730ms | ~800ms+ | Best Anthropic option |
| Claude 3 Haiku | ~1,160ms | ~1,236ms+ | Used by OpenClaw agent |
| GPT-4.1 mini | ~470ms | ~550ms+ | Fastest OpenAI option |
| GPT-4.1 nano | ~640ms | ~700ms+ | Cheapest OpenAI |
| GPT-4o-mini | ~2,620ms | ~2,900ms+ | Too slow |

Source: [Artificial Analysis](https://artificialanalysis.ai/)

**No cloud API can reliably meet 200ms including network round-trip.**

## Recommended Approach: Cactus Framework + Optimizations

### Best Bet: Qwen3-0.6B via Cactus + 3 Optimizations

1. **KV cache persistence** — cache the system prompt across ticks, only process ~30-50 changing tokens
2. **Constrained single-token output** — map 7 actions to single tokens, use logit biasing
3. **Heuristic fallback** — if model misses 150ms deadline, use NPC-style heuristic

**Estimated with all optimizations:**
- Prompt processing (delta only, ~30-50 tokens): ~37-62ms
- Single token generation: ~12ms
- Overhead: ~10ms
- **Total: ~59-84ms** — well within 200ms

### Cactus Framework

- [GitHub](https://github.com/cactus-compute/cactus) (YC S25)
- [Docs](https://cactuscompute.com/docs/v1.7)
- Claims 50ms TTFT and 70+ tok/s on flagship devices
- Proprietary `.cact` format optimized for battery-efficient inference
- iOS SDK available via Swift Package Manager
- NPU-optimized kernels for Apple Neural Engine (16-core on A18 Pro)

### Alternative: SmolLM2-135M

- Fastest possible (~60-80ms) but quality likely too poor for game reasoning
- Could work as an ultra-fast fallback tier

### Apple Foundation Models Framework (iOS 26+)

- Fast prefill (0.6ms/tok) but slow generation (~30 tok/s)
- Guardrails may block gaming use cases
- Not freely promptable for arbitrary tasks

## Implementation Feasibility on iPhone

### KV Cache Persistence
- llama.cpp supports `llama_state_save` / `llama_state_load` on iOS
- Keep system prompt KV cache warm between ticks
- Only re-process the changing game state JSON each tick

### Constrained Single-Token Output
- llama.cpp supports logit biasing via `llama_sampling`
- Set logit bias to only allow the 7 action token IDs
- Forces model to output exactly one token — eliminates multi-token generation

### Heuristic Fallback
- Trivial to implement in Swift
- Mirror the NPC bot logic from `server/npc-bot.ts`
- Set 150ms timeout, fall back if model doesn't respond

### Cactus Framework Integration
- Available as Swift Package: `https://github.com/nicepkg/cactus`
- Supports iOS 16+ (iPhone 16 Pro compatible)
- `.cact` model format for optimized inference
- Built-in NPU acceleration for Apple Silicon

## Sources

- [llama.cpp Apple A-series Benchmarks](https://github.com/ggml-org/llama.cpp/discussions/4508)
- [Cactus On-Device Inference Blog](https://huggingface.co/blog/rshemet/cactus-on-device-inference)
- [Cactus GitHub](https://github.com/cactus-compute/cactus)
- [Apple Foundation Models Research](https://machinelearning.apple.com/research/introducing-apple-foundation-models)
- [Apple Foundation Models 2025 Updates](https://machinelearning.apple.com/research/apple-foundation-models-2025-updates)
- [Claude Haiku Benchmarks](https://artificialanalysis.ai/models/claude-3-haiku/providers)
- [GPT-4.1 nano Benchmarks](https://artificialanalysis.ai/models/gpt-4-1-nano/providers)
- [iPhone 17 Inference Benchmarks (Argmax)](https://www.argmaxinc.com/blog/iphone-17-on-device-inference-benchmarks)
