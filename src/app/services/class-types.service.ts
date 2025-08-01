import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DatabaseService } from './database.service';

export interface ClassType {
  id: number;
  name: string;
  description?: string;
  duration_minutes?: number;
}

@Injectable({ providedIn: 'root' })
export class ClassTypesService {

  constructor(private databaseService: DatabaseService) {
  }

  getAll(): Observable<ClassType[]> {
    return this.databaseService.query<ClassType>(
      (supabase) => supabase.from('class_types').select('*')
    );
  }
}
