from sqlalchemy import Index
from backend.models import Message, Conversation, UsageLog, Feedback

# These indexes improve query performance for common access patterns
idx_messages_conv_created = Index('idx_messages_conv_created', Message.conversation_id, Message.created_at)
idx_conversations_user_updated = Index('idx_conversations_user_updated', Conversation.user_id, Conversation.updated_at.desc())
idx_usage_logs_user_created = Index('idx_usage_logs_user_created', UsageLog.user_id, UsageLog.created_at)
idx_feedback_created = Index('idx_feedback_created', Feedback.created_at)
