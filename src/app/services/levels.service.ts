import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DatabaseService } from './database.service';

export interface Level {
  id: number;
  name: string;
  slug?: string;
  color?: string;
  is_active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class LevelsService {
  constructor(private db: DatabaseService) {}

  getAll(): Observable<Level[]> {
    return this.db.query<Level>((supabase) =>
      supabase.from('levels').select('*').eq('is_active', true)
    );
  }

  getByClassType(classTypeId: number): Observable<Level[]> {
    return this.db.query<any>((supabase) =>
      supabase
        .from('class_type_levels')
        .select('levels(*), class_type_id, level_id')
        .eq('class_type_id', classTypeId)
    ).pipe(map(rows => (rows || []).map((r: any) => r.levels).filter(Boolean)));
  }
}