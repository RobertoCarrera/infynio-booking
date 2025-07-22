import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DatabaseService } from './database.service';
import { User } from '../models/user';

@Injectable({ providedIn: 'root' })
export class UsersService {

  constructor(private databaseService: DatabaseService) {
  }

  // Operaciones básicas usando DatabaseService
  getAll(page = 1, limit = 10): Observable<User[]> {
    return this.databaseService.getAll<User>('users', page, limit);
  }

  getById(id: string): Observable<User | null> {
    return this.databaseService.getById<User>('users', id);
  }

  search(filters: any): Observable<User[]> {
    return this.databaseService.search<User>('users', filters);
  }

  create(user: Partial<User>): Observable<User> {
    return this.databaseService.create<User>('users', user);
  }

  update(id: string, user: Partial<User>): Observable<User> {
    return this.databaseService.update<User>('users', id, user);
  }

  delete(id: string): Observable<any> {
    return this.databaseService.delete('users', id);
  }

  // Método específico de usuarios - manejo especial de errores
  getByAuthUserId(auth_user_id: string): Observable<User | null> {
    return this.databaseService.querySingle<User>(
      (supabase) => supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', auth_user_id)
        .single()
    );
  }

  // Obtener todos los usuarios (para admin)
  async getAllUsers(): Promise<User[]> {
    return new Promise((resolve, reject) => {
      this.databaseService.query<User>(
        (supabase) => supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false })
      ).subscribe({
        next: (users) => resolve(users),
        error: (error) => reject(error)
      });
    });
  }
}
