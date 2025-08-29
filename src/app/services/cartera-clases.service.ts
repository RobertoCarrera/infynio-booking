import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap, forkJoin, firstValueFrom } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { ClassTypesService } from './class-types.service';
import { 
  CarteraClase, 
  UserPackage, 
  UserPackageDetailed, 
  Package, 
  CreateUserPackage, 
  UpdateUserPackage,
  CarteraResumen,
  mapUserPackageToCarteraClase 
} from '../models/cartera-clases';

@Injectable({
  providedIn: 'root'
})
export class CarteraClasesService {

  constructor(private supabaseService: SupabaseService, private classTypesService: ClassTypesService) {}

  /**
   * MAPA DE CONVERSIÓN CORREGIDO - class_type números a strings
   */
  private mapClassTypeToString(classTypeId: number): 'MAT_FUNCIONAL' | 'REFORMER' {
    // Grouping contract for UI: only MAT_FUNCIONAL vs REFORMER; personalization handled by is_personal flag
    switch (classTypeId) {
      case 3: // Reformer
      case 23: // Reformer Personalizada
        return 'REFORMER';
      case 1: // Barre
      case 2: // Mat
      case 4: // Mat Personalizada
      case 9: // Funcional
      case 22: // Funcional Personalizada
      default:
        return 'MAT_FUNCIONAL';
    }
  }

  /**
   * Devuelve si el usuario tiene algún paquete aplicable y si alguno de ellos
   * coincide con el mes/año de la sesión. Útil para distinguir entre "no tiene
   * bono" y "tiene bono, pero para otro mes".
   */
  tienePaqueteYCoincideMes(userId: number, classTypeId: number, isPersonal: boolean, sessionDateStr: string): Observable<{ hasAny: boolean; matchesMonth: boolean }> {
    const sessionDate = new Date(sessionDateStr);
    if (isNaN(sessionDate.getTime())) {
      return from([{ hasAny: false, matchesMonth: false }]);
    }

    return from((async () => {
      const acceptableTypes = (() => {
        if (classTypeId === 2 || classTypeId === 9) return [2, 9];
        if (classTypeId === 4 || classTypeId === 22) return [4, 22];
        if (classTypeId === 23) return [23];
        if (classTypeId === 3) return [3];
        return [classTypeId];
      })();

      const mapped = await this.supabaseService.supabase
        .from('user_packages')
        .select(`
          id,
          current_classes_remaining,
          status,
          expires_at,
          next_rollover_reset_date,
          packages!inner (
            id,
            is_personal,
            class_type,
            package_allowed_class_types!inner ( class_type_id )
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('current_classes_remaining', 0);

      const checkMonthMatch = (dateStr?: string | null) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        return d.getFullYear() === sessionDate.getFullYear() && d.getMonth() === sessionDate.getMonth();
      };
      const checkExpiryOrMonth = (row: any) => {
        if (row.expires_at) {
          const exp = new Date(row.expires_at);
          if (isNaN(exp.getTime())) return false;
          // Require same month/year as the expires_at and also that the session is not after the expiry day
          return (exp.getFullYear() === sessionDate.getFullYear() && exp.getMonth() === sessionDate.getMonth()) && (sessionDate <= exp);
        }
        return checkMonthMatch(row.next_rollover_reset_date);
      };

      let hasAny = false;
      let matchesMonth = false;

      if (!mapped.error) {
        const rows = mapped.data || [];
        const acceptableTypeLegacy = (classTypeId === 9) ? 2 : classTypeId;
        for (const row of rows) {
          const pkg = row.packages as any;
          if (!pkg) continue;
          const personalMatch = pkg.is_personal === isPersonal;
          const mapping = (pkg.package_allowed_class_types || []) as Array<{ class_type_id: number }>;
          const mappedMatch = mapping.some(m => acceptableTypes.includes(m.class_type_id) || m.class_type_id === acceptableTypeLegacy);
          const directMatch = acceptableTypes.includes(pkg.class_type) || (pkg.class_type === acceptableTypeLegacy);
          if (personalMatch && (mappedMatch || directMatch)) {
            hasAny = true;
            if (checkExpiryOrMonth(row)) {
              matchesMonth = true;
              break; // already ok
            }
          }
        }
        return { hasAny, matchesMonth };
      }

      // Fallback path
      const fallback = await this.supabaseService.supabase
        .from('user_packages')
        .select(`
          current_classes_remaining,
          status,
          expires_at,
          next_rollover_reset_date,
          packages!inner (
            class_type,
            is_personal
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('current_classes_remaining', 0);

      if (fallback.error) {
        console.error('❌ Error verificando paquetes (fallback):', fallback.error);
        return { hasAny: false, matchesMonth: false };
      }

      const rows = fallback.data || [];
      const fallbackTypes = await firstValueFrom(this.classTypesService.equivalentGroup(classTypeId));

      for (const row of rows) {
        const pkg = row.packages as any;
        if (!pkg) continue;
        const personalMatch = pkg.is_personal === isPersonal;
        const typeMatch = fallbackTypes.includes(pkg.class_type) || pkg.class_type === ((classTypeId === 9) ? 2 : classTypeId);
        if (personalMatch && typeMatch) {
          hasAny = true;
          if (row.expires_at ? (sessionDate <= new Date(row.expires_at)) : checkMonthMatch(row.next_rollover_reset_date)) {
            matchesMonth = true;
            break;
          }
        }
      }

      return { hasAny, matchesMonth };
    })());
  }
  /**
   * CONVERSIÓN INVERSA - strings a números
   */
  private mapStringToClassType(classType: string): number {
    // Keep legacy mapping; only two groups are expected by UI. Default to MAT (2).
    const typeMap: { [key: string]: number } = {
      'MAT_FUNCIONAL': 2,
      'REFORMER': 3
    };
    return typeMap[classType] || 2;
  }

  /**
   * Obtiene todos los packages disponibles
   */
  getPackages(): Observable<Package[]> {
    return from(
      this.supabaseService.supabase
        .from('packages')
        .select('*')
        .order('class_type', { ascending: true })
        .order('class_count', { ascending: true })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data || [];
      })
    );
  }

  /**
   * Obtiene los user_packages de un usuario con información del package
   */
  getUserPackagesDetailed(userId: number): Observable<UserPackageDetailed[]> {
    return from(
      this.supabaseService.supabase
        .from('user_packages')
        .select(`
          *,
          expires_at,
          packages (
            id,
            name,
            class_type,
            class_count,
            price,
            is_single_class,
            is_personal
          )
        `)
  .eq('user_id', userId)
  .in('status', ['active','depleted'])
        .order('purchase_date', { ascending: false })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        
        return (response.data || []).map(item => {
          const packageData = item.packages as any;
          
          return {
            ...item,
            package_name: packageData.name,
            package_class_type: this.mapClassTypeToString(packageData.class_type), // CORRECCIÓN AQUÍ
            package_class_count: packageData.class_count,
            package_price: packageData.price,
            package_is_single_class: packageData.is_single_class,
            package_is_personal: packageData.is_personal,
            days_until_rollover: item.expires_at ? Math.ceil((new Date(item.expires_at).getTime() - Date.now()) / (1000*60*60*24)) : null,
            rollover_status: item.expires_at ? (new Date(item.expires_at) > new Date() ? 'active' : 'expired') : 'pending'
          } as UserPackageDetailed;
        });
      })
    );
  }

  /**
   * Obtiene la cartera de clases de un usuario (compatible con código existente)
   */
  getCarteraByUserId(userId: number): Observable<CarteraClase[]> {
    return this.getUserPackagesDetailed(userId).pipe(
      map(userPackages => userPackages.map(mapUserPackageToCarteraClase))
    );
  }

  /**
   * Obtiene la cartera del usuario actual
   */
  getCarteraUsuarioActual(): Observable<CarteraClase[]> {
    return this.supabaseService.getCurrentUser().pipe(
      switchMap(user => {
        if (!user) throw new Error('Usuario no autenticado');
        
        return from(
          this.supabaseService.supabase
            .from('users')
            .select('id')
            .eq('auth_user_id', user.id)
            .single()
        ).pipe(
          switchMap(userResponse => {
            if (userResponse.error) throw userResponse.error;
            return this.getCarteraByUserId(userResponse.data.id);
          })
        );
      })
    );
  }

  /**
   * Agrega un nuevo user_package (usado por administradores)
   */
  agregarPackageAUsuario(createData: CreateUserPackage): Observable<UserPackage> {
    const nowIso = new Date().toISOString();
    // Validación básica: expiration_date requerido (YYYY-MM-DD)
  // Normalize expiration date to YYYY-MM-DD (strip time if provided)
  const expRaw = createData.expiration_date;
  const expDateOnly = expRaw ? expRaw.split('T')[0] : expRaw;
  const exp = expDateOnly;
    if (!exp || !/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
      throw new Error('La fecha de caducidad es obligatoria y debe tener formato YYYY-MM-DD');
    }
    // Activation es inmediata
    const newUserPackage: any = {
      user_id: createData.user_id,
      package_id: createData.package_id,
      purchase_date: nowIso,
      activation_date: nowIso,
      current_classes_remaining: 0, // Se establecerá según el package
      classes_used_this_month: 0,
      rollover_classes_remaining: 0,
  expires_at: exp,
      status: 'active'
    };

    return from(
      this.supabaseService.supabase
        .from('packages')
        .select('class_count')
        .eq('id', createData.package_id)
        .single()
    ).pipe(
      switchMap(packageResponse => {
        if (packageResponse.error) throw packageResponse.error;
        
  newUserPackage.current_classes_remaining = packageResponse.data.class_count;
  // ensure date-only and EOM
  newUserPackage.expires_at = exp;

        return from(
          this.supabaseService.supabase
            .from('user_packages')
            .insert(newUserPackage)
            .select()
            .single()
        );
      }),
      map(response => {
  if (response.error) throw response.error;
  console.debug('agregarPackageAUsuario: inserted expires_at=', response.data?.expires_at);
        return response.data;
      })
    );
  }

  /**
   * Modifica un user_package existente usando RPC segura
   */
  modificarUserPackage(userPackageId: number, updateData: UpdateUserPackage): Observable<UserPackage> {
    return from(
      this.supabaseService.supabase.rpc('modify_user_package', {
        package_id_param: userPackageId,
        current_classes_remaining_param: updateData.current_classes_remaining,
        classes_used_this_month_param: updateData.classes_used_this_month,
  expires_at_param: updateData.expires_at,
        status_param: updateData.status
      })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        if (response.data?.error) throw new Error(response.data.error);
        return response.data;
      })
    );
  }

  /**
   * Desactiva un user_package usando RPC segura
   */
  desactivarUserPackage(userPackageId: number): Observable<boolean> {
    return from(
      this.supabaseService.supabase.rpc('deactivate_user_package', {
        package_id_param: userPackageId
      })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        if (response.data?.success === false) throw new Error(response.data.error);
        return true;
      })
    );
  }

  /**
   * FUNCIÓN CORREGIDA - Consume una clase de un user_package específico
   */
  consumirClase(userId: number, classTypeId: number, isPersonal: boolean = false): Observable<{success: boolean, message?: string}> {
    // CORRECCIÓN: Usar la nueva función de base de datos
    return from(
      this.supabaseService.supabase.rpc('consume_class_from_user_package', {
        p_user_id: userId,
        p_class_type_id: classTypeId,
        p_is_personal: isPersonal
      })
    ).pipe(
      map(response => {
        
        if (response.error) {
          console.error('❌ Error en consume_class_from_user_package:', response.error);
          throw response.error;
        }
        
        const result = response.data;
        if (result && result.success) {
          return { success: true, message: result.message };
        } else {
          return { success: false, message: result?.error || 'No tienes clases disponibles de este tipo' };
        }
      })
    );
  }

  /**
   * FUNCIÓN CORREGIDA - Verifica si el usuario tiene clases disponibles de un tipo específico
   */
  tieneClasesDisponibles(userId: number, classTypeId: number, isPersonal: boolean = false): Observable<boolean> {
    return from((async () => {
  // Obtain acceptable equivalent types from ClassTypesService (handles legacy groupings)
  const acceptableTypes = await firstValueFrom(this.classTypesService.equivalentGroup(classTypeId));
      // Intento 1: usar mapeo explícito
      const mapped = await this.supabaseService.supabase
        .from('user_packages')
        .select(`
          id,
          current_classes_remaining,
          status,
          packages!inner (
            id,
            is_personal,
            class_type,
            package_allowed_class_types!inner ( class_type_id )
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('current_classes_remaining', 0);

      if (!mapped.error) {
        const rows = mapped.data || [];
  const acceptableTypeLegacy = acceptableTypes[0] || classTypeId;
        return rows.some((row: any) => {
          const pkg = row.packages;
          if (!pkg) return false;
          const personalMatch = pkg.is_personal === isPersonal;
          const mapping = (pkg.package_allowed_class_types || []) as Array<{ class_type_id: number }>;
          const mappedMatch = mapping.some(m => acceptableTypes.includes(m.class_type_id) || m.class_type_id === acceptableTypeLegacy);
          const directMatch = acceptableTypes.includes(pkg.class_type) || (pkg.class_type === acceptableTypeLegacy);
          return personalMatch && (mappedMatch || directMatch);
        });
      }

      console.warn('⚠️ Fallback disponibilidad (sin mapeo por RLS?):', mapped.error);

      // Intento 2 (fallback): usar solamente el class_type del paquete
  const acceptableType = (await firstValueFrom(this.classTypesService.equivalentGroup(classTypeId)))[0] || classTypeId;
      const fallback = await this.supabaseService.supabase
        .from('user_packages')
        .select(`
          current_classes_remaining,
          packages!inner (
            class_type,
            is_personal
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('current_classes_remaining', 0);

      if (fallback.error) {
        console.error('❌ Error verificando clases disponibles (fallback):', fallback.error);
        return false;
      }

      const rows = fallback.data || [];
      // Expand fallback synonyms to cover legacy-tagged packages when RLS hides mapping
      const fallbackTypes = (() => {
        if (classTypeId === 23) return [23, 3]; // Reformer Personal puede venir como 3 en datos antiguos
        if (classTypeId === 4 || classTypeId === 22) return [4, 22, 2, 9]; // Personal Mat/Funcional puede venir como 2/9
        if (classTypeId === 2 || classTypeId === 9) return [2, 9];
        if (classTypeId === 3) return [3];
        return acceptableTypes;
      })();
      return rows.some((row: any) => {
        const pkg = row.packages;
        if (!pkg) return false;
        const personalMatch = pkg.is_personal === isPersonal;
        // fallback: allow synonyms per group
        const typeMatch = fallbackTypes.includes(pkg.class_type) || pkg.class_type === acceptableType;
        return personalMatch && typeMatch;
      });
    })());
  }

  /**
   * Verifica si el usuario tiene clases disponibles del tipo indicado y, además,
   * que la caducidad del bono coincida con el mes de la sesión.
   * sessionDateStr: 'YYYY-MM-DD' de la clase a reservar.
   */
  tieneClasesDisponiblesEnMes(userId: number, classTypeId: number, isPersonal: boolean, sessionDateStr: string): Observable<boolean> {
    const sessionDate = new Date(sessionDateStr);
    if (isNaN(sessionDate.getTime())) {
      return from([false]);
    }
    const sessionYear = sessionDate.getFullYear();
    const sessionMonth = sessionDate.getMonth(); // 0-based

    // Reutilizar el primer intento con mapping completo
    return from((async () => {
      const acceptableTypes = (() => {
        if (classTypeId === 2 || classTypeId === 9) return [2, 9];
        if (classTypeId === 4 || classTypeId === 22) return [4, 22];
        if (classTypeId === 23) return [23];
        if (classTypeId === 3) return [3];
        return [classTypeId];
      })();

    // Intento 1: con mapping y obtención de expires_at
    const mapped = await this.supabaseService.supabase
        .from('user_packages')
        .select(`
          id,
          current_classes_remaining,
          status,
      expires_at,
          packages!inner (
            id,
            is_personal,
            class_type,
            package_allowed_class_types!inner ( class_type_id )
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('current_classes_remaining', 0);

      const checkMonthMatch = (dateStr?: string | null) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        return d.getFullYear() === sessionYear && d.getMonth() === sessionMonth;
      };
      const checkExpiryOrMonth = (row: any) => {
        // Si hay expires_at, exigir que la sesión sea del mismo mes/año y no posterior al día de expiración
        if (row.expires_at) {
          const exp = new Date(row.expires_at);
          if (isNaN(exp.getTime())) return false;
          return (exp.getFullYear() === sessionYear && exp.getMonth() === sessionMonth) && (sessionDate <= exp);
        }
        // Si no hay expires_at, usar la comprobación de mes por next_rollover_reset_date
        return checkMonthMatch(row.next_rollover_reset_date);
      };

      if (!mapped.error) {
        const rows = mapped.data || [];
        const acceptableTypeLegacy = (classTypeId === 9) ? 2 : classTypeId;
        const ok = rows.some((row: any) => {
          const pkg = row.packages;
          if (!pkg) return false;
          const personalMatch = pkg.is_personal === isPersonal;
          const mapping = (pkg.package_allowed_class_types || []) as Array<{ class_type_id: number }>;
          const mappedMatch = mapping.some(m => acceptableTypes.includes(m.class_type_id) || m.class_type_id === acceptableTypeLegacy);
          const directMatch = acceptableTypes.includes(pkg.class_type) || (pkg.class_type === acceptableTypeLegacy);
          return personalMatch && (mappedMatch || directMatch) && checkMonthMatch(row.expires_at);
        });
        return ok;
      }

      // Fallback: sin mapping, solo class_type directo y caducidad
      const acceptableType = (classTypeId === 9) ? 2 : classTypeId;
    const fallback = await this.supabaseService.supabase
        .from('user_packages')
        .select(`
          current_classes_remaining,
          status,
      expires_at,
          packages!inner (
            class_type,
            is_personal
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('current_classes_remaining', 0);

      if (fallback.error) {
        console.error('❌ Error verificando clases por mes (fallback):', fallback.error);
        return false;
      }
      const rows = fallback.data || [];
  // Expand fallback types using equivalentGroup as well
  const fallbackTypes = await firstValueFrom(this.classTypesService.equivalentGroup(classTypeId));
      return rows.some((row: any) => {
        const pkg = row.packages;
        if (!pkg) return false;
        const personalMatch = pkg.is_personal === isPersonal;
        const typeMatch = fallbackTypes.includes(pkg.class_type) || pkg.class_type === acceptableType;
  return personalMatch && typeMatch && checkMonthMatch(row.expires_at);
      });
    })());
  }

  /**
   * Obtiene el resumen de clases disponibles por tipo
   */
  getResumenClases(userId: number): Observable<CarteraResumen> {
    return this.getUserPackagesDetailed(userId).pipe(
      map(userPackages => {
        const resumen: CarteraResumen = {
          matFuncional: 0,
          reformer: 0,
          matPersonalizada: 0,
          reformerPersonalizada: 0
        };

        userPackages.forEach(userPackage => {
          if (userPackage.package_class_type === 'MAT_FUNCIONAL') {
            if (userPackage.package_is_personal) {
              resumen.matPersonalizada += userPackage.current_classes_remaining;
            } else {
              resumen.matFuncional += userPackage.current_classes_remaining;
            }
          } else if (userPackage.package_class_type === 'REFORMER') {
            if (userPackage.package_is_personal) {
              resumen.reformerPersonalizada += userPackage.current_classes_remaining;
            } else {
              resumen.reformer += userPackage.current_classes_remaining;
            }
          }
        });

        return resumen;
      })
    );
  }

  /**
   * Procesa el rollover de clases para todos los user_packages que han vencido
   */
  processRollover(): Observable<boolean> {
    const today = new Date().toISOString().split('T')[0];
    
    return from(
      this.supabaseService.supabase
        .from('user_packages')
        .select('*')
        .eq('status', 'active')
        .lte('expires_at', today)
    ).pipe(
      switchMap(response => {
        if (response.error) throw response.error;
        
        const packagesToUpdate = response.data || [];
        
        if (packagesToUpdate.length === 0) {
          return from([true]);
        }

        // Procesar cada package
        const updates = packagesToUpdate.map(userPackage => {
          const nextMonth = new Date();
          nextMonth.setMonth(nextMonth.getMonth() + 1, 7);
          
          return this.modificarUserPackage(userPackage.id, {
              classes_used_this_month: 0,
              expires_at: nextMonth.toISOString().split('T')[0]
            });
        });

        return forkJoin(updates);
      }),
      map(() => true)
    );
  }
}