#!/bin/bash

# Script para probar la Edge Function manualmente
# Ejecutar desde la terminal: bash test-edge-function.sh

SUPABASE_URL="https://nlybxhgbukgqldtoekry.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5seWJ4aGdidWtncWxkdG9la3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwNjU4MjMsImV4cCI6MjA2NzY0MTgyM30.0rqOOrh8iM42UYvmFQElYJ4lgvw5seEV2Y_zmD7CcTw"

echo "🧪 Testing Edge Function manually..."
echo ""

# Test 1: Sin filtro de fechas
echo "📊 Test 1: Sin filtro de fechas"
curl -s -X GET "${SUPABASE_URL}/functions/v1/get-class-sessions" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "----------------------------------------"
echo ""

# Test 2: Con filtro de fechas (el que está fallando)
echo "📅 Test 2: Con filtro de fechas (2025-09-01 a 2025-09-06)"
curl -s -X GET "${SUPABASE_URL}/functions/v1/get-class-sessions?start_date=2025-09-01&end_date=2025-09-06" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "----------------------------------------"
echo ""

# Test 3: Con rango más amplio
echo "📅 Test 3: Con rango más amplio (todo septiembre)"
curl -s -X GET "${SUPABASE_URL}/functions/v1/get-class-sessions?start_date=2025-09-01&end_date=2025-09-30" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "✅ Tests completed!"
