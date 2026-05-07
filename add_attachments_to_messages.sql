-- Add attachment columns to existing messages table
ALTER TABLE `messages` ADD COLUMN IF NOT EXISTS `attachment_url` VARCHAR(500);
ALTER TABLE `messages` ADD COLUMN IF NOT EXISTS `attachment_type` ENUM('image', 'file', 'video') NULL;

-- Run in phpMyAdmin: chat_db database, SQL tab

