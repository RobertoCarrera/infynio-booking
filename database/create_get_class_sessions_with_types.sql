-- =============================================
-- RPC Function: get_class_sessions_with_types
-- Purpose: Provide class sessions with complete type information for calendar
-- =============================================

CREATE OR REPLACE FUNCTION get_class_sessions_with_types()
RETURNS TABLE (
  id INTEGER,
  class_type_id INTEGER,
  capacity INTEGER,
  schedule_date DATE,
  schedule_time TIME,
  class_type_name TEXT,
  class_type_description TEXT,
  class_type_duration INTEGER,
  bookings JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.id,
    cs.class_type_id,
    cs.capacity,
    cs.schedule_date,
    cs.schedule_time,
    ct.name::TEXT AS class_type_name,
    ct.description::TEXT AS class_type_description,
    ct.duration_minutes AS class_type_duration,
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', b.id,
            'user_id', b.user_id,
            'booking_date_time', b.booking_date_time,
            'cancellation_time', b.cancellation_time,
            'status', b.status
          )
        )
        FROM bookings b
        WHERE b.class_session_id = cs.id 
          AND b.status = 'confirmed' -- Solo reservas confirmadas
      ),
      '[]'::JSON
    ) AS bookings
  FROM class_sessions cs
  LEFT JOIN class_types ct ON ct.id = cs.class_type_id
  WHERE cs.schedule_date >= CURRENT_DATE -- Solo sesiones futuras
  ORDER BY cs.schedule_date, cs.schedule_time;
END;
$$ LANGUAGE plpgsql;

-- Variant with date range support
CREATE OR REPLACE FUNCTION get_class_sessions_with_types(
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  id INTEGER,
  class_type_id INTEGER,
  capacity INTEGER,
  schedule_date DATE,
  schedule_time TIME,
  class_type_name TEXT,
  class_type_description TEXT,
  class_type_duration INTEGER,
  bookings JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.id,
    cs.class_type_id,
    cs.capacity,
    cs.schedule_date,
    cs.schedule_time,
    ct.name::TEXT AS class_type_name,
    ct.description::TEXT AS class_type_description,
    ct.duration_minutes AS class_type_duration,
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', b.id,
            'user_id', b.user_id,
            'booking_date_time', b.booking_date_time,
            'cancellation_time', b.cancellation_time,
            'status', b.status
          )
        )
        FROM bookings b
        WHERE b.class_session_id = cs.id 
          AND b.status = 'confirmed' -- Solo reservas confirmadas
      ),
      '[]'::JSON
    ) AS bookings
  FROM class_sessions cs
  LEFT JOIN class_types ct ON ct.id = cs.class_type_id
  WHERE cs.schedule_date >= start_date 
    AND cs.schedule_date <= end_date
  ORDER BY cs.schedule_date, cs.schedule_time;
END;
$$ LANGUAGE plpgsql;