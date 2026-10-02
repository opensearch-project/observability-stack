"""Model selection for the Strands travel planner: Bedrock when available, scripted otherwise.

Demos have to work without AWS credentials, so each agent has a scripted fallback model.
It drives the same Strands agent loop as a real model: the first turn asks for the agent's
tools, the second turn answers from the tool results. Strands therefore still emits real
invoke_agent, chat and execute_tool spans with token usage. The fallback reports
`scripted-fallback` as its model id, so it is never mistaken for a real model.

Bedrock is used when the fault panel's "use real LLM" toggle is on and AWS credentials are
present, matching the plain-agents example.
"""

import json
import logging
import os
import threading
import time
import uuid
from collections.abc import AsyncGenerator, Callable
from typing import Any

import httpx
from strands.models import Model

logger = logging.getLogger(__name__)

FAULT_PANEL_URL = os.getenv("FAULT_PANEL_URL", "http://fault-panel:8085")
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "global.anthropic.claude-haiku-4-5-20251001-v1:0")
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
SCRIPTED_MODEL_ID = "scripted-fallback"

# Tools to call for a prompt: [(tool_name, tool_input), ...]
PlanFn = Callable[[str], list[tuple[str, dict]]]
# Final answer from the prompt and the tool results: (prompt, {tool_name: result_text}) -> text
AnswerFn = Callable[[str, dict[str, str]], str]

_config = {"use_real_llm": False}


def _poll_fault_panel() -> None:
    while True:
        try:
            resp = httpx.get(f"{FAULT_PANEL_URL}/config", timeout=2)
            if resp.status_code == 200:
                _config["use_real_llm"] = bool(resp.json().get("use_real_llm", False))
        except Exception:  # noqa: BLE001 - the panel is optional
            pass
        time.sleep(30)


threading.Thread(target=_poll_fault_panel, daemon=True).start()


def _has_aws_credentials() -> bool:
    try:
        import boto3

        return boto3.Session().get_credentials() is not None
    except Exception:  # noqa: BLE001
        return False


def use_bedrock() -> bool:
    """Whether this request should call Bedrock (toggle on and credentials present)."""
    return _config["use_real_llm"] and _has_aws_credentials()


def bedrock_model():
    from strands.models import BedrockModel

    return BedrockModel(model_id=BEDROCK_MODEL_ID, region_name=AWS_REGION)


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _text_of(message: dict) -> str:
    return " ".join(block.get("text", "") for block in message.get("content", []) if "text" in block)


def _current_turn(messages: list) -> tuple[str, list]:
    """The latest user prompt and the messages after it (earlier turns are history)."""
    for i in range(len(messages) - 1, -1, -1):
        message = messages[i]
        if message.get("role") == "user" and _text_of(message):
            return _text_of(message), messages[i:]
    return "", messages


def _tool_results(messages: list) -> dict[str, str]:
    """Tool results in the given messages, keyed by the tool name that produced them."""
    names = {}
    results = {}
    for message in messages:
        for block in message.get("content", []):
            if "toolUse" in block:
                names[block["toolUse"]["toolUseId"]] = block["toolUse"]["name"]
            if "toolResult" in block:
                result = block["toolResult"]
                text = " ".join(
                    c.get("text", json.dumps(c.get("json", ""))) for c in result.get("content", [])
                )
                if result.get("status") == "error":
                    text = f"ERROR: {text}"
                results[names.get(result["toolUseId"], result["toolUseId"])] = text
    return results


class ScriptedModel(Model):
    """A deterministic Strands model: call the planned tools, then answer from their results."""

    def __init__(self, plan: PlanFn, answer: AnswerFn):
        self.plan = plan
        self.answer = answer
        self.config = {"model_id": SCRIPTED_MODEL_ID}

    def update_config(self, **model_config: Any) -> None:
        self.config.update(model_config)

    def get_config(self) -> Any:
        return self.config

    async def structured_output(self, output_model, prompt, system_prompt=None, **kwargs):
        raise NotImplementedError("The scripted fallback model does not support structured output")
        yield  # pragma: no cover - makes this an async generator

    async def stream(
        self,
        messages,
        tool_specs=None,
        system_prompt=None,
        *,
        tool_choice=None,
        system_prompt_content=None,
        invocation_state=None,
        **kwargs: Any,
    ) -> AsyncGenerator[dict, None]:
        prompt, turn = _current_turn(messages)
        results = _tool_results(turn)
        known_tools = {spec["name"] for spec in (tool_specs or [])}
        planned = [(name, args) for name, args in self.plan(prompt) if name in known_tools]
        input_tokens = _estimate_tokens(json.dumps(messages, default=str) + (system_prompt or ""))

        yield {"messageStart": {"role": "assistant"}}
        pending = [(name, args) for name, args in planned if name not in results]
        if pending:
            # First turn: request every planned tool (Strands runs them as execute_tool spans).
            for name, args in pending:
                yield {"contentBlockStart": {"start": {"toolUse": {"name": name, "toolUseId": f"tooluse_{uuid.uuid4().hex[:12]}"}}}}
                yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(args)}}}}
                yield {"contentBlockStop": {}}
            stop_reason = "tool_use"
            output_tokens = _estimate_tokens(json.dumps(pending))
        else:
            text = self.answer(prompt, results)
            yield {"contentBlockStart": {"start": {}}}
            yield {"contentBlockDelta": {"delta": {"text": text}}}
            yield {"contentBlockStop": {}}
            stop_reason = "end_turn"
            output_tokens = _estimate_tokens(text)
        yield {"messageStop": {"stopReason": stop_reason}}
        yield {
            "metadata": {
                "usage": {
                    "inputTokens": input_tokens,
                    "outputTokens": output_tokens,
                    "totalTokens": input_tokens + output_tokens,
                },
                "metrics": {"latencyMs": 0},
            }
        }
