# Manual Testing Guide

## Testing the Calendar Fix

### Before Testing
1. **Execute the database script**: Run `database/create_get_class_sessions_with_types.sql` in your Supabase database
2. **Deploy the changes**: The application code changes are ready

### What to Test

#### 1. Calendar Loading
- Navigate to the calendar page
- Verify that class sessions appear without 400 errors
- Check browser console for no error messages related to `schedule_time.asc:1`

#### 2. Class Display
- Verify classes show with correct information:
  - Class type names (Mat, Reformer, Barre, etc.)
  - Correct capacity and available spots
  - Proper date and time display

#### 3. Error Handling
- Check that error messages are user-friendly if there are connection issues
- Verify loading states work properly

#### 4. Booking Functionality  
- Try to book a class (if you have test users with packages)
- Verify booking counts update correctly
- Check that package validation works

### Expected Behavior After Fix

✅ **Before (Broken)**:
- 400 error when loading sessions
- Empty calendar
- Console errors about `booking_time` fields
- Complex join query failures

✅ **After (Fixed)**:
- Calendar loads successfully
- Classes display with full information
- No 400 errors in console
- Fast loading via RPC function

### Troubleshooting

If calendar still doesn't load:
1. Verify the RPC function was created successfully in Supabase
2. Check Supabase logs for any function execution errors
3. Verify the application is using the updated code
4. Check browser network tab for the actual API calls being made

### Technical Details

The fix changes:
- `booking_time` → `booking_date_time` (correct field name)
- Complex joins → Simple RPC function call
- Error-prone nested selects → Optimized database function
- Manual data transformation → Database-side JSON aggregation