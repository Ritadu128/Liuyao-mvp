CREATE TABLE `aiDailyBudgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`spentMicros` int NOT NULL DEFAULT 0,
	`reservedMicros` int NOT NULL DEFAULT 0,
	`requestCount` int NOT NULL DEFAULT 0,
	`upstreamCallCount` int NOT NULL DEFAULT 0,
	`alertSentAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiDailyBudgets_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_daily_budgets_date_unique` UNIQUE(`date`)
);
--> statement-breakpoint
CREATE TABLE `aiRequestLogs` (
	`requestId` varchar(32) NOT NULL,
	`date` varchar(10) NOT NULL,
	`ipHash` varchar(32) NOT NULL,
	`status` varchar(32) NOT NULL,
	`httpStatus` int,
	`turnstileRequired` int NOT NULL DEFAULT 0,
	`turnstileVerified` int NOT NULL DEFAULT 0,
	`attemptCount` int NOT NULL DEFAULT 0,
	`promptCacheHitTokens` int NOT NULL DEFAULT 0,
	`promptCacheMissTokens` int NOT NULL DEFAULT 0,
	`completionTokens` int NOT NULL DEFAULT 0,
	`estimatedCostMicros` int NOT NULL DEFAULT 0,
	`upstreamRequestId` varchar(128),
	`failureKind` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiRequestLogs_requestId` PRIMARY KEY(`requestId`)
);
