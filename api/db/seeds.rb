# The spike runs against one test ranch. Join it from the app with this invite code.
Ranch.find_or_create_by!(invite_code: "KARACREEK") { |ranch| ranch.name = "Kara Creek (spike)" }
