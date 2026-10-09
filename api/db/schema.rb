# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_09_214823) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.string "record_id", null: false
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "members", force: :cascade do |t|
    t.bigint "ranch_id", null: false
    t.string "name", null: false
    t.string "role", default: "hand", null: false
    t.string "device_token", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["device_token"], name: "index_members_on_device_token", unique: true
    t.index ["ranch_id"], name: "index_members_on_ranch_id"
  end

  create_table "observations", id: :string, force: :cascade do |t|
    t.bigint "ranch_id", null: false
    t.bigint "member_id", null: false
    t.string "kind", null: false
    t.decimal "latitude", precision: 10, scale: 7, null: false
    t.decimal "longitude", precision: 10, scale: 7, null: false
    t.float "accuracy"
    t.datetime "observed_at", null: false
    t.string "tag_number"
    t.text "note"
    t.string "status", default: "open", null: false
    t.datetime "deleted_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "waypoint_id"
    t.datetime "resolved_at"
    t.bigint "resolved_by_id"
    t.index ["member_id"], name: "index_observations_on_member_id"
    t.index ["ranch_id", "updated_at"], name: "index_observations_on_ranch_id_and_updated_at"
    t.index ["ranch_id"], name: "index_observations_on_ranch_id"
    t.index ["resolved_by_id"], name: "index_observations_on_resolved_by_id"
    t.index ["waypoint_id"], name: "index_observations_on_waypoint_id"
  end

  create_table "photos", id: :string, force: :cascade do |t|
    t.bigint "ranch_id", null: false
    t.string "observation_id", null: false
    t.datetime "uploaded_at"
    t.datetime "deleted_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["observation_id"], name: "index_photos_on_observation_id"
    t.index ["ranch_id", "updated_at"], name: "index_photos_on_ranch_id_and_updated_at"
    t.index ["ranch_id"], name: "index_photos_on_ranch_id"
  end

  create_table "ranches", force: :cascade do |t|
    t.string "name", null: false
    t.string "invite_code", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["invite_code"], name: "index_ranches_on_invite_code", unique: true
  end

  create_table "rides", id: :string, force: :cascade do |t|
    t.bigint "ranch_id", null: false
    t.bigint "member_id", null: false
    t.datetime "started_at", null: false
    t.datetime "ended_at", null: false
    t.float "distance_meters", default: 0.0, null: false
    t.jsonb "track", default: [], null: false
    t.datetime "deleted_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "name"
    t.index ["member_id"], name: "index_rides_on_member_id"
    t.index ["ranch_id", "updated_at"], name: "index_rides_on_ranch_id_and_updated_at"
    t.index ["ranch_id"], name: "index_rides_on_ranch_id"
  end

  create_table "waypoints", id: :string, force: :cascade do |t|
    t.bigint "ranch_id", null: false
    t.bigint "member_id", null: false
    t.string "kind", null: false
    t.string "name", null: false
    t.decimal "latitude", precision: 10, scale: 7, null: false
    t.decimal "longitude", precision: 10, scale: 7, null: false
    t.text "note"
    t.datetime "deleted_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["member_id"], name: "index_waypoints_on_member_id"
    t.index ["ranch_id", "updated_at"], name: "index_waypoints_on_ranch_id_and_updated_at"
    t.index ["ranch_id"], name: "index_waypoints_on_ranch_id"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "members", "ranches"
  add_foreign_key "observations", "members"
  add_foreign_key "observations", "members", column: "resolved_by_id"
  add_foreign_key "observations", "ranches"
  add_foreign_key "observations", "waypoints"
  add_foreign_key "photos", "observations"
  add_foreign_key "photos", "ranches"
  add_foreign_key "rides", "members"
  add_foreign_key "rides", "ranches"
  add_foreign_key "waypoints", "members"
  add_foreign_key "waypoints", "ranches"
end
