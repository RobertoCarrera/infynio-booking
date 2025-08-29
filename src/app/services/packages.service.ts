import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface Package {
  id: number;
  name: string;
  class_type: 'MAT_FUNCIONAL' | 'REFORMER';
  class_count: number;
  price: number;
  is_single_class: boolean;
  is_personal: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserPackage {
  id: number;
  user_id: number;
  package_id: number;
  purchase_date: string;
  activation_date?: string;
  current_classes_remaining: number;
  classes_used_this_month: number;
  expires_at?: string;
  status: 'active' | 'expired' | 'suspended' | 'depleted';
  package?: Package;
}

@Injectable({
  providedIn: 'root'
})
export class PackagesService {

  constructor(private supabase: SupabaseService) { }

  // Obtener todos los paquetes disponibles
  async getAvailablePackages(): Promise<Package[]> {
    try {
      const { data, error } = await this.supabase.supabase
        .from('packages')
        .select('*')
        .order('class_type', { ascending: true })
        .order('class_count', { ascending: true });

      if (error) {
        console.error('Error fetching packages:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAvailablePackages:', error);
      throw error;
    }
  }

  // Obtener paquetes activos del usuario
  async getUserActivePackages(userId: number): Promise<UserPackage[]> {
    try {
      const { data, error } = await this.supabase.supabase
          .from('user_packages')
          .select(`
            *,
            package:packages(*)
          `)
          .eq('user_id', userId)
          .in('status', ['active','depleted'])
          .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user packages:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getUserActivePackages:', error);
      throw error;
    }
  }

  // Comprar un paquete (esto se haría normalmente tras el pago)
  async purchasePackage(userId: number, packageId: number, expirationDate?: string): Promise<UserPackage> {
    try {
      // Primero obtenemos la información del paquete
      const { data: packageData, error: packageError } = await this.supabase.supabase
        .from('packages')
        .select('*')
        .eq('id', packageId)
        .single();

      if (packageError) {
        console.error('Error fetching package:', packageError);
        throw packageError;
      }

      // Calculamos las fechas
      const purchaseDate = new Date().toISOString();
      const activationDate = new Date().toISOString();

      // Helper para producir YYYY-MM-DD (sin componente horario) usando fecha local
      const toDateOnly = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      // Date helpers
      const toDateOnlyFromAny = (val?: string) => val ? val.split('T')[0] : undefined;
      const endOfMonthDateOnly = (input: Date | string) => {
        const d = typeof input === 'string' ? new Date(input + 'T00:00:00') : input;
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return toDateOnly(last);
      };

      // Si el llamador pasa una expirationDate, úsala (normalizar si viene con time)
      let expiresAt: string;
      if (expirationDate) {
        // Accept 'YYYY-MM-DD' or ISO; normalize to EOM date-only
        const raw = expirationDate.split('T')[0];
        expiresAt = endOfMonthDateOnly(raw);
      } else {
        // last day of next month, date-only
        const now = new Date();
        const lastOfNext = new Date(now.getFullYear(), now.getMonth() + 2, 0);
        expiresAt = toDateOnly(lastOfNext);
      }

  const newUserPackage = {
        user_id: userId,
        package_id: packageId,
        purchase_date: purchaseDate,
        activation_date: activationDate,
        current_classes_remaining: packageData.class_count,
        classes_used_this_month: 0,
  expires_at: expiresAt,
        status: 'active' as const
      };

      const { data, error } = await this.supabase.supabase
        .from('user_packages')
        .insert([newUserPackage])
        .select(`
          *,
          package:packages(*)
        `)
        .single();

      if (error) {
        console.error('Error purchasing package:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in purchasePackage:', error);
      throw error;
    }
  }

  // Obtener resumen de clases disponibles por tipo
  async getUserClassesSummary(userId: number): Promise<{
    matFuncional: {
      total: number;
      monthly: number;
      rollover: number;
      packages: UserPackage[];
    };
    reformer: {
      total: number;
      monthly: number;
      rollover: number;
      packages: UserPackage[];
    };
  }> {
    try {
      const userPackages = await this.getUserActivePackages(userId);
      
      const matFuncionalPackages = userPackages.filter(
        pkg => pkg.package?.class_type === 'MAT_FUNCIONAL'
      );
      
      const reformerPackages = userPackages.filter(
        pkg => pkg.package?.class_type === 'REFORMER'
      );

      const calculateTotals = (packages: UserPackage[]) => {
        const total = packages.reduce((sum, pkg) => sum + pkg.current_classes_remaining, 0);
        return {
          total,
          monthly: 0,
          rollover: 0,
          packages
        };
      };

      return {
        matFuncional: calculateTotals(matFuncionalPackages),
        reformer: calculateTotals(reformerPackages)
      };
    } catch (error) {
      console.error('Error in getUserClassesSummary:', error);
      throw error;
    }
  }

  // Usar una clase (llamado cuando se hace una reserva)
  async useClass(userId: number, classType: 'MAT_FUNCIONAL' | 'REFORMER'): Promise<boolean> {
    try {
      // Obtener paquetes activos del tipo específico
      const userPackages = await this.getUserActivePackages(userId);
      const availablePackages = userPackages.filter(
        pkg => pkg.package?.class_type === classType && pkg.current_classes_remaining > 0
      );

      if (availablePackages.length === 0) {
        throw new Error('No hay clases disponibles de este tipo');
      }

      // Usar primero las clases del mes actual, luego las de rollover
      let packageToUpdate = availablePackages.find(pkg => pkg.current_classes_remaining > 0);

      if (packageToUpdate) {
        const { error } = await this.supabase.supabase
          .from('user_packages')
          .update({
            classes_used_this_month: packageToUpdate.classes_used_this_month + 1,
            current_classes_remaining: packageToUpdate.current_classes_remaining - 1
          })
          .eq('id', packageToUpdate.id);

        if (error) throw error;
      }

      return true;
    } catch (error) {
      console.error('Error in useClass:', error);
      throw error;
    }
  }

  // Cancelar una clase (devolver la clase usada)
  async cancelClass(userId: number, classType: 'MAT_FUNCIONAL' | 'REFORMER'): Promise<boolean> {
    try {
      // Obtener paquetes activos del tipo específico
      const userPackages = await this.getUserActivePackages(userId);
      const availablePackages = userPackages.filter(
        pkg => pkg.package?.class_type === classType
      );

      if (availablePackages.length === 0) {
        throw new Error('No hay paquetes disponibles de este tipo');
      }

      // Devolver la clase al paquete más reciente que tenga espacio
      const packageToUpdate = availablePackages[0]; // El más reciente por el order

      const { error } = await this.supabase.supabase
        .from('user_packages')
        .update({
          classes_used_this_month: Math.max(0, packageToUpdate.classes_used_this_month - 1),
          current_classes_remaining: packageToUpdate.current_classes_remaining + 1
        })
        .eq('id', packageToUpdate.id);

  if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error in cancelClass:', error);
      throw error;
    }
  }

  // Métodos de administración para gestionar clases de usuarios
  async adminAddClasses(userId: number, classType: 'MAT_FUNCIONAL' | 'REFORMER', amount: number, expirationDate?: string): Promise<boolean> {
    try {
      // Buscar si el usuario ya tiene un paquete activo del tipo especificado
      const userPackages = await this.getUserActivePackages(userId);
      let existingPackage = userPackages.find(pkg => pkg.package?.class_type === classType);

      if (existingPackage) {
        // Actualizar paquete existente
        const { error } = await this.supabase.supabase
          .from('user_packages')
          .update({
            current_classes_remaining: existingPackage.current_classes_remaining + amount,
            // removed monthly_classes_limit as part of model simplification
          })
          .eq('id', existingPackage.id);

        if (error) throw error;
      } else {
        // Crear un nuevo paquete personalizado
        const toDateOnly = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };
        const endOfMonthDateOnly = (input: Date | string) => {
          const d = typeof input === 'string' ? new Date(input + 'T00:00:00') : input;
          const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
          return toDateOnly(last);
        };
        const now = new Date();
        const lastOfNext = new Date(now.getFullYear(), now.getMonth() + 2, 0);
        const defaultNext = toDateOnly(lastOfNext);
  const expiresAt = expirationDate ? endOfMonthDateOnly(expirationDate.split('T')[0]) : defaultNext;

  const packageData = {
          user_id: userId,
          package_id: null, // No está asociado a un paquete específico
          purchase_date: new Date().toISOString(),
          activation_date: new Date().toISOString(),
          current_classes_remaining: amount,
          classes_used_this_month: 0,
          expires_at: expiresAt,
          status: 'active' as const
        };

        // Insertar directamente en user_packages sin package_id (paquete personalizado de admin)
        const { error } = await this.supabase.supabase
          .from('user_packages')
          .insert([packageData]);

        if (error) throw error;

        // También crear un registro temporal en packages para referencia
        const customPackage = {
          name: `Admin Pack - ${classType}`,
          class_type: classType,
          class_count: amount,
          price: 0,
          is_single_class: true, // treat admin custom packages as single-type with explicit expiry
          is_personal: true
        };

        const { data: newPackage, error: packageError } = await this.supabase.supabase
          .from('packages')
          .insert([customPackage])
          .select()
          .single();

        if (packageError) throw packageError;

        // Actualizar el user_package con el package_id
        const { error: updateError } = await this.supabase.supabase
          .from('user_packages')
          .update({ package_id: newPackage.id })
          .eq('user_id', userId)
          .eq('package_id', null);

        if (updateError) throw updateError;
      }

      return true;
    } catch (error) {
      console.error('Error in adminAddClasses:', error);
      throw error;
    }
  }

  async adminRemoveClasses(userId: number, classType: 'MAT_FUNCIONAL' | 'REFORMER', amount: number): Promise<boolean> {
    try {
      const userPackages = await this.getUserActivePackages(userId);
      const availablePackages = userPackages.filter(pkg => pkg.package?.class_type === classType);

      if (availablePackages.length === 0) {
        throw new Error('El usuario no tiene paquetes de este tipo');
      }

      // Quitar clases del paquete más reciente
      const packageToUpdate = availablePackages[0];
      const newRemaining = Math.max(0, packageToUpdate.current_classes_remaining - amount);
      const { error } = await this.supabase.supabase
        .from('user_packages')
        .update({
          current_classes_remaining: newRemaining,
          // removed monthly_classes_limit
          classes_used_this_month: Math.min(packageToUpdate.classes_used_this_month, newRemaining)
        })
        .eq('id', packageToUpdate.id);

      if (error) throw error;

      // Si las clases llegan a 0, marcar como depleted (se muestra en cartera)
      if (newRemaining === 0) {
        const { error: statusError } = await this.supabase.supabase
          .from('user_packages')
          .update({ status: 'depleted' })
          .eq('id', packageToUpdate.id);

        if (statusError) throw statusError;
      }

      return true;
    } catch (error) {
      console.error('Error in adminRemoveClasses:', error);
      throw error;
    }
  }

  // Hard-delete a user_package (admin only) via RPC
  async adminDeleteUserPackage(userPackageId: number): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const { data, error } = await this.supabase.supabase.rpc('admin_delete_user_package', { p_user_package_id: userPackageId });
      if (error) {
        // Surface RPC transport errors
        console.error('RPC error adminDeleteUserPackage:', error);
        return { success: false, error: error.message || String(error) };
      }
      // RPC returns JSON already describing success or failure
      return Array.isArray(data) ? data[0] : (data || { success: true, message: 'Operación completada' });
    } catch (err: any) {
      console.error('Error in adminDeleteUserPackage:', err);
      throw err;
    }
  }
}
