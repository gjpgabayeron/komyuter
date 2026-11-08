alter table "public"."admin_users"
  add constraint "admin_users_user_id_auth_users_id_fk"
  foreign key ("user_id") references "auth"."users" ("id") on delete cascade;
