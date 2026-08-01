ALTER TABLE `views` ADD `day_bucket` integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `views_recording_viewer_day_idx` ON `views` (`recording_id`,`viewer_key`,`day_bucket`);--> statement-breakpoint
CREATE INDEX `recordings_user_status_created_idx` ON `recordings` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `recordings_status_expires_idx` ON `recordings` (`status`,`expires_at`);