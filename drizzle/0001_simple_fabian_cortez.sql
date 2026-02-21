CREATE TABLE `readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`question` text NOT NULL,
	`linesJson` text NOT NULL,
	`originalKey` varchar(4) NOT NULL,
	`originalName` varchar(32) NOT NULL,
	`originalBits` varchar(6) NOT NULL,
	`changedKey` varchar(4),
	`changedName` varchar(32),
	`changedBits` varchar(6),
	`movingLinesJson` text NOT NULL,
	`integratedReading` text,
	`hexagramReading` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `readings_id` PRIMARY KEY(`id`)
);
