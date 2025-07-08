export interface User {
  id: number;
  username: string;
  password_hash: "user";
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
}