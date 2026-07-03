DROP TABLE `dismissals`;--> statement-breakpoint
CREATE TABLE `dismissed_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rate_change_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`rate_change_id`) REFERENCES `rate_changes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dismissed_changes_change_uidx` ON `dismissed_changes` (`rate_change_id`);
