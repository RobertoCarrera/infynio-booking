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
   * MAPA DE CONVERSIÓN CORREGIDO - class_type números a strings
   */
  private mapClassTypeToString(classTypeId: number): 'MAT_FUNCIONAL' | 'REFORMER' | 'PERSONALIZADA' | 'FUNCIONAL' | 'BARRE' {
    const typeMap: { [key: number]: 'MAT_FUNCIONAL' | 'REFORMER' | 'PERSONALIZADA' | 'FUNCIONAL' | 'BARRE' } = {
      1: 'BARRE',           // Barre
      2: 'MAT_FUNCIONAL',   // Mat  
      3: 'REFORMER',        // Reformer
      4: 'PERSONALIZADA',   // Personalizada
      9: 'FUNCIONAL'        // Funcional
    };
    return typeMap[classTypeId] || 'MAT_FUNCIONAL';
  }

  /**
   * CONVERSIÓN INVERSA - strings a números
   */
  private mapStringToClassType(classType: string): number {
    const typeMap: { [key: string]: number } = {
      'BARRE': 1,
      'MAT_FUNCIONAL': 2,
      'REFORMER': 3,
      'PERSONALIZADA': 4,
      'FUNCIONAL': 9
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
        .eq('status', 'active')
        .order('purchase_date', { ascending: false })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        
        return (response.data || []).map(item => {
          const packageData = item.packages as any;
          
          // Calcular días hasta rollover
          const daysUntilRollover = item.next_rollover_reset_date 
            ? Math.ceil((new Date(item.next_rollover_reset_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
            : null;

          return {
            ...item,
            package_name: packageData.name,
            package_class_type: this.mapClassTypeToString(packageData.class_type), // CORRECCIÓN AQUÍ
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
   * FUNCIÓN CORREGIDA - Consume una clase de un user_package específico
   */
  consumirClase(userId: number, classTypeId: number, isPersonal: boolean = false): Observable<{success: boolean, message?: string}> {
    console.log('🔄 Intentando consumir clase:', { userId, classTypeId, isPersonal });
    
    // CORRECCIÓN: Usar la nueva función de base de datos
    return from(
      this.supabaseService.supabase.rpc('consume_class_from_user_package', {
        p_user_id: userId,
        p_class_type_id: classTypeId,
        p_is_personal: isPersonal
      })
    ).pipe(
      map(response => {
        console.log('✅ Respuesta de consume_class_from_user_package:', response);
        
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
  console.log('🔍 Verificando disponibilidad de clases:', { userId, classTypeId, isPersonal });
  
  return from(
    this.supabaseService.supabase
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
      .gt('current_classes_remaining', 0)
  ).pipe(
    map(response => {
      if (response.error) {
        console.error('❌ Error verificando clases disponibles:', response.error);
        return false;
      }
      
      console.log('📊 User packages encontrados:', response.data);
      
      const hasAvailableClasses = (response.data || []).some(item => {
        const packageData = item.packages as any;
        const typeMatch = packageData.class_type === classTypeId;
        const personalMatch = packageData.is_personal === isPersonal;
        const match = typeMatch && personalMatch;
        
        console.log('🔍 Verificando package:', { 
          packageClassType: packageData.class_type, 
          targetClassType: classTypeId,
          typeMatch,
          packageIsPersonal: packageData.is_personal,
          targetIsPersonal: isPersonal,
          personalMatch,
          finalMatch: match,
          remainingClasses: item.current_classes_remaining
        });
        
        return match;
      });
      
      console.log('✅ Resultado final:', hasAvailableClasses);
      return hasAvailableClasses;
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