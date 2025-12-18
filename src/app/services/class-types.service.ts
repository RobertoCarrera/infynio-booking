import { Injectable } from '@angular/core';
import { Observable, firstValueFrom, map } from 'rxjs';
import { DatabaseService } from './database.service';

export interface ClassType {
  id: number;
  name: string;
  description?: string;
  duration_minutes?: number;
  is_personal?: boolean;
  default_capacity?: number;
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

  // Determine if a class type is personal. Prefer explicit flag in DB; otherwise use name heuristic.
  isPersonal(classTypeId: number): Observable<boolean> {
    return this.databaseService.query<ClassType>((supabase) =>
      supabase.from('class_types').select('id, name, is_personal').eq('id', classTypeId).limit(1)
    ).pipe(
      map(rows => {
        const ct = (rows || [])[0] as any;
        if (!ct) return false;
        if (ct.is_personal !== undefined && ct.is_personal !== null) return !!ct.is_personal;
        const name = (ct.name || '').toLowerCase();
        return /personal|individual|personalizada|personalizado/.test(name);
      })
    );
  }

  // Return a list of equivalent class type ids for matching packages (e.g. mat<->funcional legacy mapping)
  equivalentGroup(classTypeId: number): Observable<number[]> {
    return this.databaseService.query<ClassType>((supabase) =>
      supabase.from('class_types').select('id, name')
    ).pipe(map(all => {
      const list = all || [];
      const target = list.find((a: any) => Number(a.id) === Number(classTypeId));
      if (!target) return [classTypeId];
      const name = (target.name || '').toLowerCase();
      if (/mat|funcional|syncro/.test(name)) {
        return list.filter((a: any) => /mat|funcional|syncro/.test(((a.name || '') as string).toLowerCase())).map((a: any) => a.id);
      }
      if (/reformer/.test(name)) {
        return list.filter((a: any) => /reformer/.test(((a.name || '') as string).toLowerCase())).map((a: any) => a.id);
      }
      return [classTypeId];
    }));
  }

  // Return default capacity from class_types metadata or sensible fallback
  defaultCapacity(classTypeId: number): Observable<number> {
    return this.databaseService.query<ClassType>((supabase) =>
      supabase.from('class_types').select('id, name, default_capacity').eq('id', classTypeId).limit(1)
    ).pipe(map(rows => {
      const ct = (rows || [])[0] as any;
      if (ct && (ct as any).default_capacity) return Number((ct as any).default_capacity);
      const name = (ct && ct.name || '').toLowerCase();
      if (/personal|individual/.test(name)) return 1;
      if (/reformer/.test(name)) return 2;
      if (/barre/.test(name)) return 2;
      if (/mat/.test(name)) return 8;
      if (/funcional/.test(name)) return 10;
      return 8;
    }));
  }
}
