-- Busca reservas donde la fecha de la clase es posterior a la fecha de caducidad del bono utilizado
SELECT 
    u.email AS user_email,
    u.name AS user_name,
    u.surname AS user_surname,
    cs.schedule_date AS class_date,
    up.expires_at AS package_expires_at,
    p.name AS package_name,
    b.booking_date_time AS booking_created_at,
    cs.id AS session_id,
    up.id AS user_package_id
FROM 
    public.bookings b
JOIN 
    public.class_sessions cs ON b.class_session_id = cs.id
JOIN 
    public.user_packages up ON b.user_package_id = up.id
JOIN 
    public.users u ON b.user_id = u.id
LEFT JOIN
    public.packages p ON up.package_id = p.id
WHERE 
    b.status = 'CONFIRMED' -- Solo reservas confirmadas
    AND up.expires_at IS NOT NULL -- Bonos que tienen fecha de caducidad
    AND cs.schedule_date > up.expires_at -- La clase es DESPUÉS de que el bono caduque
ORDER BY 
    cs.schedule_date DESC;
