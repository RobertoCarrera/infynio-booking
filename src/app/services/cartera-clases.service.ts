import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap, forkJoin } from 'rxjs';
import { SupabaseService } from './supabase.service';
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

  constructor(private supabaseService: SupabaseService) {}

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
          package:packages (
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
        .eq('status', 'active')
        .order('purchase_date', { ascending: false })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        
        return (response.data || []).map(item => {
          const packageData = item.package as Package;
          
          // Calcular días hasta rollover
          const daysUntilRollover = item.next_rollover_reset_date 
            ? Math.ceil((new Date(item.next_rollover_reset_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
            : null;

          return {
            ...item,
            package_name: packageData.name,
            package_class_type: packageData.class_type,
            package_class_count: packageData.class_count,
            package_price: packageData.price,
            package_is_single_class: packageData.is_single_class,
            package_is_personal: packageData.is_personal,
            days_until_rollover: daysUntilRollover,
            rollover_status: daysUntilRollover && daysUntilRollover > 0 ? 'active' : daysUntilRollover === null ? 'pending' : 'expired'
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
    const now = new Date().toISOString();
    
    // Calcular la fecha de rollover (primera semana del mes siguiente)
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 7); // Día 7 del mes siguiente
    
    const newUserPackage = {
      ...createData,
      purchase_date: now,
      activation_date: createData.activation_date || now,
      current_classes_remaining: 0, // Se establecerá según el package
      classes_used_this_month: 0,
      rollover_classes_remaining: 0,
      next_rollover_reset_date: nextMonth.toISOString().split('T')[0],
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
        return response.data;
      })
    );
  }

  /**
   * Modifica un user_package existente
   */
  modificarUserPackage(userPackageId: number, updateData: UpdateUserPackage): Observable<UserPackage> {
    return from(
      this.supabaseService.supabase
        .from('user_packages')
        .update(updateData)
        .eq('id', userPackageId)
        .select()
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data;
      })
    );
  }

  /**
   * Desactiva un user_package
   */
  desactivarUserPackage(userPackageId: number): Observable<boolean> {
    return from(
      this.supabaseService.supabase
        .from('user_packages')
        .update({ status: 'inactive' })
        .eq('id', userPackageId)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return true;
      })
    );
  }

  /**
   * Consume una clase de un user_package específico
   */
  consumirClase(userId: number, classType: 'MAT_FUNCIONAL' | 'REFORMER', isPersonal: boolean = false): Observable<boolean> {
    // Buscar un user_package apropiado que tenga clases disponibles
    return from(
      this.supabaseService.supabase
        .from('user_packages')
        .select(`
          *,
          packages (
            class_type,
            is_personal
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('current_classes_remaining', 0)
        .order('purchase_date', { ascending: true }) // Usar los más antiguos primero
    ).pipe(
      switchMap(response => {
        if (response.error) throw response.error;
        
        // Filtrar por tipo de clase y si es personal
        const appropriatePackages = (response.data || []).filter(item => {
          const packageData = item.packages as any;
          return packageData.class_type === classType && packageData.is_personal === isPersonal;
        });

        if (appropriatePackages.length === 0) {
          throw new Error('No tienes clases disponibles de este tipo');
        }

        const userPackage = appropriatePackages[0];
        const newClassesRemaining = userPackage.current_classes_remaining - 1;
        const newClassesUsedThisMonth = userPackage.classes_used_this_month + 1;

        return this.modificarUserPackage(userPackage.id, {
          current_classes_remaining: newClassesRemaining,
          classes_used_this_month: newClassesUsedThisMonth
        });
      }),
      map(() => true)
    );
  }

  /**
   * Verifica si el usuario tiene clases disponibles de un tipo específico
   */
  tieneClasesDisponibles(userId: number, classType: 'MAT_FUNCIONAL' | 'REFORMER', isPersonal: boolean = false): Observable<boolean> {
    return from(
      this.supabaseService.supabase
        .from('user_packages')
        .select(`
          current_classes_remaining,
          packages (
            class_type,
            is_personal
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('current_classes_remaining', 0)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        
        return (response.data || []).some(item => {
          const packageData = item.packages as any;
          return packageData.class_type === classType && packageData.is_personal === isPersonal;
        });
      })
    );
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
        .lte('next_rollover_reset_date', today)
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
            rollover_classes_remaining: userPackage.current_classes_remaining,
            classes_used_this_month: 0,
            next_rollover_reset_date: nextMonth.toISOString().split('T')[0]
          });
        });

        return forkJoin(updates);
      }),
      map(() => true)
    );
  }
}
