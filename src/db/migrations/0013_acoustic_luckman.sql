CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_profile_idx" ON "transactions" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "workspace_invites_profile_idx" ON "workspace_invites" USING btree ("profile_id");