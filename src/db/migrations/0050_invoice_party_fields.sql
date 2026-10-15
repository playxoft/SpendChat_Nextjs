ALTER TABLE "invoice_clients" ADD COLUMN "phone" varchar(40);--> statement-breakpoint
ALTER TABLE "invoice_clients" ADD COLUMN "contact_person" varchar(120);--> statement-breakpoint
ALTER TABLE "invoice_clients" ADD COLUMN "notes" varchar(1000);--> statement-breakpoint
ALTER TABLE "invoice_sellers" ADD COLUMN "phone" varchar(40);--> statement-breakpoint
ALTER TABLE "invoice_sellers" ADD COLUMN "website" varchar(200);--> statement-breakpoint
ALTER TABLE "invoice_sellers" ADD COLUMN "registration_number" varchar(60);--> statement-breakpoint
ALTER TABLE "invoice_sellers" ADD COLUMN "bank_details" varchar(600);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "client_phone" varchar(40);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "client_contact_person" varchar(120);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "seller_phone" varchar(40);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "seller_website" varchar(200);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "seller_registration_number" varchar(60);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "seller_bank_details" varchar(600);