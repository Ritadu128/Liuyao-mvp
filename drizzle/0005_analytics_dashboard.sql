CREATE TABLE `analyticsEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`eventName` varchar(48) NOT NULL,
	`path` varchar(128) NOT NULL,
	`sessionHash` varchar(32) NOT NULL,
	`referrerHost` varchar(128),
	`deviceType` varchar(16) NOT NULL,
	`country` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analyticsEvents_id` PRIMARY KEY(`id`),
	INDEX `analytics_events_date_event_idx` (`date`,`eventName`),
	INDEX `analytics_events_date_path_idx` (`date`,`path`),
	INDEX `analytics_events_date_session_idx` (`date`,`sessionHash`)
);
