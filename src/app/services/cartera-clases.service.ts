import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { CarteraClase, BonoType, TIPOS_BONOS } from '../models/cartera-clases';

@Injectable({
  providedIn: 'root'
})
export class CarteraClasesService {

  constructor(private supabaseService: SupabaseService) {}

  /**
   * Obtiene la cartera de clases de un usuario
   */
  getCarteraByUserId(userId: number): Observable<CarteraClase[]> {
    return from(
      this.supabaseService.supabase
        .from('cartera_clases')
        .select('*')
        .eq('user_id', userId)
        .eq('activo', true)
        .order('fecha_compra', { ascending: false })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data || [];
      })
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
   * Agrega clases a la cartera de un usuario (usado por administradores)
   */
  agregarClases(userId: number, tipoBonoIndex: number): Observable<CarteraClase> {
    const tipoBono = TIPOS_BONOS[tipoBonoIndex];
    if (!tipoBono) {
      throw new Error('Tipo de bono no válido');
    }

    const nuevaCartera: Omit<CarteraClase, 'id'> = {
      user_id: userId,
      bono_type: tipoBono.type,
      bono_subtype: tipoBono.subtype,
      clases_disponibles: tipoBono.clases,
      clases_totales: tipoBono.clases,
      fecha_compra: new Date().toISOString(),
      activo: true
    };

    return from(
      this.supabaseService.supabase
        .from('cartera_clases')
        .insert(nuevaCartera)
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
   * Modifica las clases disponibles de una entrada específica de la cartera
   */
  modificarClases(carteraId: number, nuevasClasesDisponibles: number): Observable<CarteraClase> {
    const updateData = {
      clases_disponibles: Math.max(0, nuevasClasesDisponibles), // No permitir números negativos
      updated_at: new Date().toISOString()
    };

    return from(
      this.supabaseService.supabase
        .from('cartera_clases')
        .update(updateData)
        .eq('id', carteraId)
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
   * Desactiva una entrada de la cartera
   */
  desactivarCartera(carteraId: number): Observable<boolean> {
    return from(
      this.supabaseService.supabase
        .from('cartera_clases')
        .update({ 
          activo: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', carteraId)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return true;
      })
    );
  }

  /**
   * Consume una clase de la cartera (cuando el usuario hace una reserva)
   */
  consumirClase(userId: number, tipoClase: 'MAT-FUNCIONAL' | 'REFORMER', esPersonalizada: boolean = false): Observable<boolean> {
    const subtype = esPersonalizada ? 'CLASE-PERSONALIZADA' : 'CLASE-NORMAL';
    
    return from(
      this.supabaseService.supabase
        .from('cartera_clases')
        .select('*')
        .eq('user_id', userId)
        .eq('bono_type', tipoClase)
        .eq('bono_subtype', subtype)
        .eq('activo', true)
        .gt('clases_disponibles', 0)
        .order('fecha_compra', { ascending: true }) // Usar las más antiguas primero
        .limit(1)
        .single()
    ).pipe(
      switchMap(response => {
        if (response.error || !response.data) {
          throw new Error('No tienes clases disponibles de este tipo');
        }

        const cartera = response.data;
        const nuevasClasesDisponibles = cartera.clases_disponibles - 1;

        return this.modificarClases(cartera.id!, nuevasClasesDisponibles).pipe(
          map(() => true)
        );
      })
    );
  }

  /**
   * Verifica si el usuario tiene clases disponibles de un tipo específico
   */
  tieneClasesDisponibles(userId: number, tipoClase: 'MAT-FUNCIONAL' | 'REFORMER', esPersonalizada: boolean = false): Observable<boolean> {
    const subtype = esPersonalizada ? 'CLASE-PERSONALIZADA' : 'CLASE-NORMAL';
    
    return from(
      this.supabaseService.supabase
        .from('cartera_clases')
        .select('clases_disponibles')
        .eq('user_id', userId)
        .eq('bono_type', tipoClase)
        .eq('bono_subtype', subtype)
        .eq('activo', true)
        .gt('clases_disponibles', 0)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return (response.data || []).length > 0;
      })
    );
  }

  /**
   * Obtiene el resumen de clases disponibles por tipo
   */
  getResumenClases(userId: number): Observable<{matFuncional: number, reformer: number, matPersonalizada: number, reformerPersonalizada: number}> {
    return this.getCarteraByUserId(userId).pipe(
      map(cartera => {
        const resumen = {
          matFuncional: 0,
          reformer: 0,
          matPersonalizada: 0,
          reformerPersonalizada: 0
        };

        cartera.forEach(entrada => {
          if (entrada.bono_type === 'MAT-FUNCIONAL') {
            if (entrada.bono_subtype === 'CLASE-PERSONALIZADA') {
              resumen.matPersonalizada += entrada.clases_disponibles;
            } else {
              resumen.matFuncional += entrada.clases_disponibles;
            }
          } else if (entrada.bono_type === 'REFORMER') {
            if (entrada.bono_subtype === 'CLASE-PERSONALIZADA') {
              resumen.reformerPersonalizada += entrada.clases_disponibles;
            } else {
              resumen.reformer += entrada.clases_disponibles;
            }
          }
        });

        return resumen;
      })
    );
  }

  /**
   * Obtiene todos los tipos de bonos disponibles
   */
  getTiposBonos(): BonoType[] {
    return TIPOS_BONOS;
  }
}
