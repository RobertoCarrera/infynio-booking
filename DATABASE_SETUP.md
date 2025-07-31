# Database Setup Instructions

## Required Database Function

To resolve the calendar loading issue, you need to execute the following SQL function in your Supabase database:

### 1. Execute the RPC Function Creation

Run the SQL script located at:
```
database/create_get_class_sessions_with_types.sql
```

This script creates the `get_class_sessions_with_types` function that the calendar component needs to load class sessions properly.

### 2. What the Function Does

The function:
- Returns class sessions with complete type information 
- Includes booking data in proper JSON format
- Uses correct field names (`booking_date_time` instead of `booking_time`)
- Supports both date-range queries and all-sessions queries
- Only returns future sessions (schedule_date >= CURRENT_DATE)
- Only includes confirmed bookings

### 3. Function Signatures

The script creates two function variants:

1. **All sessions**: `get_class_sessions_with_types()`
2. **Date range**: `get_class_sessions_with_types(start_date DATE, end_date DATE)`

### 4. Usage in Application

The Angular service now uses these functions instead of complex joins:

```typescript
// For all sessions
.rpc('get_class_sessions_with_types')

// For date range
.rpc('get_class_sessions_with_types', {
  start_date: startDate,
  end_date: endDate
})
```

### 5. Expected Result

After executing the database script and deploying the application changes:
- Calendar should load without 400 errors
- Class sessions should display properly with all type information
- Booking counts should be accurate
- No more complex join errors