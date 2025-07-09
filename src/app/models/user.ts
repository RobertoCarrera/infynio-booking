export interface User {
  id: number;
  auth_user_id?: string; // UUID de Supabase Auth
  username?: string;
  name?: string;
  surname?: string;
  date_birth?: Date;
  email?: string;
  telephone?: string;
  role_id?: number;
  role?: string; // Si quieres acceder al nombre del rol directamente
}