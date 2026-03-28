"""Notification delivery for external actions (email, Slack, Teams)."""

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
import httpx

from backend.config import settings
from backend.logging_config import get_logger

logger = get_logger("notifications")


async def send_email(preview: dict) -> dict:
    """Send an email based on the action preview.

    preview should have: {"to": str, "subject": str, "body": str}
    Returns {"sent": True/False, "error": str|None}
    """
    to = preview.get("to", "")
    subject = preview.get("subject", "")
    body = preview.get("body", "")

    if not settings.SMTP_HOST:
        logger.warning("email_send_skipped", reason="SMTP not configured")
        return {"sent": False, "error": "SMTP not configured. Set SMTP_HOST to enable email delivery."}

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))
    # If body contains HTML tags, also attach as HTML
    if "<" in body and ">" in body:
        msg.attach(MIMEText(body, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME or None,
            password=settings.SMTP_PASSWORD or None,
            use_tls=settings.SMTP_USE_TLS,
        )
        logger.info("email_sent", to=to, subject=subject)
        return {"sent": True, "error": None}
    except Exception as e:
        logger.error("email_send_failed", to=to, error=str(e))
        return {"sent": False, "error": str(e)}


async def send_slack_message(preview: dict) -> dict:
    """Send a Slack message via incoming webhook.

    preview should have: {"channel": str, "message": str}
    Optionally "webhook_url" to override the default.
    Returns {"sent": True/False, "error": str|None}
    """
    webhook_url = preview.get("webhook_url") or settings.SLACK_WEBHOOK_URL
    message = preview.get("message", "")
    channel = preview.get("channel")

    if not webhook_url:
        logger.warning("slack_send_skipped", reason="Slack webhook not configured")
        return {"sent": False, "error": "Slack webhook not configured. Set SLACK_WEBHOOK_URL to enable."}

    payload = {"text": message}
    if channel:
        payload["channel"] = channel

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
        logger.info("slack_message_sent", channel=channel)
        return {"sent": True, "error": None}
    except Exception as e:
        logger.error("slack_send_failed", error=str(e))
        return {"sent": False, "error": str(e)}


async def send_teams_message(preview: dict) -> dict:
    """Send a Teams message via incoming webhook.

    preview should have: {"channel": str, "message": str}
    Optionally "webhook_url" to override.
    Falls back to TEAMS_WEBHOOK_URL from settings.
    Returns {"sent": True/False, "error": str|None}
    """
    webhook_url = preview.get("webhook_url") or settings.TEAMS_WEBHOOK_URL
    message = preview.get("message", "")

    if not webhook_url:
        logger.warning("teams_send_skipped", reason="Teams webhook not configured")
        return {"sent": False, "error": "Teams webhook not configured. Set TEAMS_WEBHOOK_URL to enable."}

    # Teams Adaptive Card format
    card = {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "body": [
                        {"type": "TextBlock", "text": message, "wrap": True},
                    ],
                },
            }
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(webhook_url, json=card)
            resp.raise_for_status()
        logger.info("teams_message_sent")
        return {"sent": True, "error": None}
    except Exception as e:
        logger.error("teams_send_failed", error=str(e))
        return {"sent": False, "error": str(e)}


async def deliver_action(action_type: str, preview: dict) -> dict:
    """Route delivery to the appropriate channel."""
    if action_type == "email":
        return await send_email(preview)
    elif action_type == "slack":
        return await send_slack_message(preview)
    elif action_type == "teams":
        return await send_teams_message(preview)
    else:
        return {"sent": False, "error": f"Unknown action type: {action_type}"}
