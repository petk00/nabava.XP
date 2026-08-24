-- ============================================================
-- schema.sql — Struktura baze podataka
-- Sustav za upravljanje zahtjevima za nabavu (Veleučilište u Rijeci)
-- MySQL 8.0+, InnoDB, utf8mb4_unicode_ci
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

DROP TABLE IF EXISTS `RequestStatusHistory`;
DROP TABLE IF EXISTS `AppSetting`;
DROP TABLE IF EXISTS `Attachment`;
DROP TABLE IF EXISTS `PurchaseRequestItem`;
DROP TABLE IF EXISTS `PurchaseRequest`;
DROP TABLE IF EXISTS `Department`;
DROP TABLE IF EXISTS `ItemCategory`;
DROP TABLE IF EXISTS `AppUser`;
DROP TABLE IF EXISTS `FiscalYear`;
DROP TABLE IF EXISTS `RequestStatus`;
DROP TABLE IF EXISTS `Role`;

-- ------------------------------------------------------------
-- Role
-- ------------------------------------------------------------
CREATE TABLE `Role` (
  `id_role` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id_role`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- AppUser
-- ------------------------------------------------------------
CREATE TABLE `AppUser` (
  `id_user` int NOT NULL AUTO_INCREMENT,
  `fk_role` int NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `invite_token` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invite_token_expires` datetime DEFAULT NULL,
  PRIMARY KEY (`id_user`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_invite_token` (`invite_token`),
  KEY `fk_appuser_role` (`fk_role`),
  CONSTRAINT `fk_appuser_role` FOREIGN KEY (`fk_role`) REFERENCES `Role` (`id_role`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- FiscalYear
-- ------------------------------------------------------------
CREATE TABLE `FiscalYear` (
  `id_fiscal_year` int NOT NULL AUTO_INCREMENT,
  `year` int NOT NULL,
  `is_closed` tinyint(1) NOT NULL DEFAULT '0',
  `total_budget` decimal(14,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id_fiscal_year`),
  UNIQUE KEY `year` (`year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Department
-- ------------------------------------------------------------
CREATE TABLE `Department` (
  `id_department` int NOT NULL AUTO_INCREMENT,
  `fk_fiscal_year` int NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_limit` decimal(14,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_department`),
  UNIQUE KEY `uq_dept_name_per_year` (`fk_fiscal_year`, `name`),
  KEY `fk_department_fiscalyear` (`fk_fiscal_year`),
  CONSTRAINT `fk_department_fiscalyear` FOREIGN KEY (`fk_fiscal_year`) REFERENCES `FiscalYear` (`id_fiscal_year`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- ItemCategory
-- ------------------------------------------------------------
CREATE TABLE `ItemCategory` (
  `id_item_category` int NOT NULL AUTO_INCREMENT,
  `fk_fiscal_year` int NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_limit` decimal(14,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_item_category`),
  UNIQUE KEY `uq_cat_name_per_year` (`fk_fiscal_year`, `name`),
  KEY `fk_itemcategory_fiscalyear` (`fk_fiscal_year`),
  CONSTRAINT `fk_itemcategory_fiscalyear` FOREIGN KEY (`fk_fiscal_year`) REFERENCES `FiscalYear` (`id_fiscal_year`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- RequestStatus
-- ------------------------------------------------------------
CREATE TABLE `RequestStatus` (
  `id_request_status` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id_request_status`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- PurchaseRequest
-- ------------------------------------------------------------
CREATE TABLE `PurchaseRequest` (
  `id_purchase_request` int NOT NULL AUTO_INCREMENT,
  `request_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fk_fiscal_year` int NOT NULL,
  `fk_department` int NOT NULL,
  `fk_request_status` int NOT NULL,
  `fk_created_by_user` int NOT NULL,
  `total_amount` decimal(14,2) DEFAULT NULL,
  `justification` text COLLATE utf8mb4_unicode_ci,
  `comment` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id_purchase_request`),
  UNIQUE KEY `request_number` (`request_number`),
  KEY `fk_purchaserequest_fiscalyear` (`fk_fiscal_year`),
  KEY `fk_purchaserequest_department` (`fk_department`),
  KEY `fk_purchaserequest_status` (`fk_request_status`),
  KEY `fk_purchaserequest_user` (`fk_created_by_user`),
  CONSTRAINT `fk_purchaserequest_department` FOREIGN KEY (`fk_department`) REFERENCES `Department` (`id_department`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_purchaserequest_fiscalyear` FOREIGN KEY (`fk_fiscal_year`) REFERENCES `FiscalYear` (`id_fiscal_year`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_purchaserequest_status` FOREIGN KEY (`fk_request_status`) REFERENCES `RequestStatus` (`id_request_status`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_purchaserequest_user` FOREIGN KEY (`fk_created_by_user`) REFERENCES `AppUser` (`id_user`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- PurchaseRequestItem
-- ------------------------------------------------------------
CREATE TABLE `PurchaseRequestItem` (
  `id_purchase_request_item` int NOT NULL AUTO_INCREMENT,
  `fk_purchase_request` int NOT NULL,
  `fk_item_category` int NOT NULL,
  `item_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_purchase_request_item`),
  KEY `fk_pritem_request` (`fk_purchase_request`),
  KEY `fk_pritem_category` (`fk_item_category`),
  CONSTRAINT `fk_pritem_category` FOREIGN KEY (`fk_item_category`) REFERENCES `ItemCategory` (`id_item_category`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pritem_request` FOREIGN KEY (`fk_purchase_request`) REFERENCES `PurchaseRequest` (`id_purchase_request`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Attachment
-- ------------------------------------------------------------
CREATE TABLE `Attachment` (
  `id_attachment` int NOT NULL AUTO_INCREMENT,
  `fk_purchase_request` int NOT NULL,
  `fk_uploaded_by_user` int NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `document_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_attachment`),
  KEY `fk_attachment_request` (`fk_purchase_request`),
  KEY `fk_attachment_user` (`fk_uploaded_by_user`),
  CONSTRAINT `fk_attachment_request` FOREIGN KEY (`fk_purchase_request`) REFERENCES `PurchaseRequest` (`id_purchase_request`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_attachment_user` FOREIGN KEY (`fk_uploaded_by_user`) REFERENCES `AppUser` (`id_user`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- RequestStatusHistory
-- ------------------------------------------------------------
CREATE TABLE `RequestStatusHistory` (
  `id_request_status_history` int NOT NULL AUTO_INCREMENT,
  `fk_purchase_request` int NOT NULL,
  `fk_request_status` int NOT NULL,
  `fk_changed_by_user` int NOT NULL,
  `changed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `comment` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id_request_status_history`),
  KEY `fk_statushistory_request` (`fk_purchase_request`),
  KEY `fk_statushistory_status` (`fk_request_status`),
  KEY `fk_statushistory_user` (`fk_changed_by_user`),
  CONSTRAINT `fk_statushistory_request` FOREIGN KEY (`fk_purchase_request`) REFERENCES `PurchaseRequest` (`id_purchase_request`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_statushistory_status` FOREIGN KEY (`fk_request_status`) REFERENCES `RequestStatus` (`id_request_status`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_statushistory_user` FOREIGN KEY (`fk_changed_by_user`) REFERENCES `AppUser` (`id_user`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- AppSetting — runtime postavke (npr. AI provider, Gemini model),
-- mijenjaju se kroz admin API bez restarta servera. Bez FK ovisnosti.
-- ------------------------------------------------------------
CREATE TABLE `AppSetting` (
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
-- Kraj schema.sql
-- ============================================================
