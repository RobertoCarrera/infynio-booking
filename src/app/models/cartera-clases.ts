// Modelo para la tabla packages
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

// Modelo para la tabla user_packages
export interface UserPackage {
  id: number;
  user_id: number;
  package_id: number;
  purchase_date: string;
  activation_date?: string;
  current_classes_remaining: number;
  monthly_classes_limit?: number;
  classes_used_this_month: number;
  rollover_classes_remaining: number;
  next_rollover_reset_date?: string;
  status: 'active' | 'inactive' | 'expired' | 'pending';
  
  // Relación con package (para cuando hagamos JOIN)
  package?: Package;
}

// Tipo para resumen de cartera del usuario
export interface CarteraResumen {
  matFuncional: number;
  reformer: number;
  matPersonalizada: number;
  reformerPersonalizada: number;
}

// Tipo para mostrar información completa de un paquete del usuario
export interface UserPackageDetailed extends UserPackage {
  package_name: string;
  package_class_type: 'MAT_FUNCIONAL' | 'REFORMER';
  package_class_count: number;
  package_price: number;
  package_is_single_class: boolean;
  package_is_personal: boolean;
  days_until_rollover?: number;
  rollover_status: 'active' | 'expired' | 'pending';
}

// Para mantener compatibilidad con el código existente
export interface CarteraClase {
  id: number;
  user_id: number;
  bono_type: 'MAT-FUNCIONAL' | 'REFORMER';
  bono_subtype: 'CLASE-NORMAL' | 'CLASE-PERSONALIZADA';
  clases_disponibles: number;
  clases_totales: number;
  fecha_compra: string;
  fecha_expiracion?: string;
  activo: boolean;
  
  // Campos adicionales para la nueva lógica
  monthly_classes_limit?: number;
  classes_used_this_month: number;
  rollover_classes_remaining: number;
  next_rollover_reset_date?: string;
  status: string;
  package_name: string;
  package_price: number;
}

// Tipos para administración
export interface CreateUserPackage {
  user_id: number;
  package_id: number;
  activation_date?: string;
}

export interface UpdateUserPackage {
  current_classes_remaining?: number;
  monthly_classes_limit?: number;
  classes_used_this_month?: number;
  rollover_classes_remaining?: number;
  next_rollover_reset_date?: string;
  status?: string;
}

// Función helper para convertir UserPackageDetailed a CarteraClase (compatibilidad)
export function mapUserPackageToCarteraClase(userPackage: UserPackageDetailed): CarteraClase {
  return {
    id: userPackage.id,
    user_id: userPackage.user_id,
    bono_type: userPackage.package_class_type === 'MAT_FUNCIONAL' ? 'MAT-FUNCIONAL' : 'REFORMER',
    bono_subtype: userPackage.package_is_personal ? 'CLASE-PERSONALIZADA' : 'CLASE-NORMAL',
    clases_disponibles: userPackage.current_classes_remaining,
    clases_totales: userPackage.package_class_count,
    fecha_compra: userPackage.purchase_date,
    fecha_expiracion: userPackage.next_rollover_reset_date,
    activo: userPackage.status === 'active',
    monthly_classes_limit: userPackage.monthly_classes_limit,
    classes_used_this_month: userPackage.classes_used_this_month,
    rollover_classes_remaining: userPackage.rollover_classes_remaining,
    next_rollover_reset_date: userPackage.next_rollover_reset_date,
    status: userPackage.status,
    package_name: userPackage.package_name,
    package_price: userPackage.package_price
  };
}
