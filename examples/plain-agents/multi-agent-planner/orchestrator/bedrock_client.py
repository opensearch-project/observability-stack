"""
Amazon Bedrock Converse API client for real LLM calls.
Uses boto3 with the default credential chain (env vars, ~/.aws/credentials, instance role).
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError, NoCredentialsError, EndpointConnectionError

logger = logging.getLogger(__name__)

BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "global.anthropic.claude-haiku-4-5-20251001-v1:0")
BEDROCK_REGION = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-west-2"))


class BedrockUnavailableError(Exception):
    pass


def get_bedrock_client():
    """Create Bedrock Runtime client. Returns None if credentials are missing."""
    try:
        client = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
        return client
    except (NoCredentialsError, Exception) as e:
        logger.warning(f"Bedrock client init failed: {e}")
        return None


def openai_tools_to_bedrock(tools: List[Dict]) -> Dict:
    """Convert OpenAI-style tool definitions to Bedrock toolConfig format."""
    bedrock_tools = []
    for tool in tools:
        func = tool.get("function", tool)
        bedrock_tools.append({
            "toolSpec": {
                "name": func["name"],
                "description": func.get("description", ""),
                "inputSchema": {
                    "json": func.get("parameters", {"type": "object", "properties": {}})
                }
            }
        })
    return {"tools": bedrock_tools}


def converse(
    client,
    messages: List[Dict[str, Any]],
    system: Optional[str] = None,
    tool_config: Optional[Dict] = None,
    model_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Call Bedrock Converse API.

    Args:
        client: boto3 bedrock-runtime client
        messages: Bedrock message format [{"role": "user", "content": [{"text": "..."}]}]
        system: Optional system prompt
        tool_config: Optional Bedrock toolConfig dict
        model_id: Model to use (defaults to BEDROCK_MODEL_ID)

    Returns:
        Full Converse API response dict with output, usage, stopReason

    Raises:
        BedrockUnavailableError on credential/throttle/connection issues
    """
    kwargs = {
        "modelId": model_id or BEDROCK_MODEL_ID,
        "messages": messages,
    }
    if system:
        kwargs["system"] = [{"text": system}]
    if tool_config:
        kwargs["toolConfig"] = tool_config

    try:
        response = client.converse(**kwargs)
        return response
    except NoCredentialsError as e:
        raise BedrockUnavailableError(f"No AWS credentials: {e}")
    except EndpointConnectionError as e:
        raise BedrockUnavailableError(f"Cannot reach Bedrock endpoint: {e}")
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code in ("ThrottlingException", "ServiceUnavailableException", "AccessDeniedException", "ValidationException"):
            raise BedrockUnavailableError(f"Bedrock error: {error_code} - {e.response['Error']['Message']}")
        raise


def extract_text(response: Dict) -> str:
    """Extract text content from a Converse API response."""
    message = response.get("output", {}).get("message", {})
    for block in message.get("content", []):
        if "text" in block:
            return block["text"]
    return ""


def extract_tool_use(response: Dict) -> Optional[Dict]:
    """Extract the first toolUse block from a Converse API response."""
    message = response.get("output", {}).get("message", {})
    for block in message.get("content", []):
        if "toolUse" in block:
            return block["toolUse"]
    return None


def get_usage(response: Dict) -> Dict[str, int]:
    """Extract token usage from response."""
    usage = response.get("usage", {})
    return {
        "input_tokens": usage.get("inputTokens", 0),
        "output_tokens": usage.get("outputTokens", 0),
    }
