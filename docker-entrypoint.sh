#!/bin/sh
set -e

if [ -f /run/secrets/sac_supabase_service_role_key ]; then
  export SUPABASE_SERVICE_ROLE_KEY="$(cat /run/secrets/sac_supabase_service_role_key)"
fi

exec "$@"
