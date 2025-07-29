export interface CarteraClase {
  id?: number;
  user_id: number;
  bono_type: 'MAT-FUNCIONAL' | 'REFORMER';
  bono_subtype: 'CLASE-NORMAL' | 'CLASE-PERSONALIZADA';
  clases_disponibles: number;
  clases_totales: number;
  fecha_compra: string;
  fecha_expiracion?: string;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BonoType {
  type: 'MAT-FUNCIONAL' | 'REFORMER';
  subtype: 'CLASE-NORMAL' | 'CLASE-PERSONALIZADA';
  clases: number;
  nombre: string;
  descripcion: string;
}

export const TIPOS_BONOS: BonoType[] = [
  {
    type: 'MAT-FUNCIONAL',
    subtype: 'CLASE-NORMAL',
    clases: 1,
    nombre: '1 Clase Mat-Funcional',
    descripcion: 'Una clase individual de Mat-Funcional'
  },
  {
    type: 'MAT-FUNCIONAL',
    subtype: 'CLASE-NORMAL',
    clases: 4,
    nombre: '4 Clases Mat-Funcional',
    descripcion: 'Bono de 4 clases de Mat-Funcional'
  },
  {
    type: 'MAT-FUNCIONAL',
    subtype: 'CLASE-NORMAL',
    clases: 8,
    nombre: '8 Clases Mat-Funcional',
    descripcion: 'Bono de 8 clases de Mat-Funcional'
  },
  {
    type: 'MAT-FUNCIONAL',
    subtype: 'CLASE-NORMAL',
    clases: 12,
    nombre: '12 Clases Mat-Funcional',
    descripcion: 'Bono de 12 clases de Mat-Funcional'
  },
  {
    type: 'MAT-FUNCIONAL',
    subtype: 'CLASE-PERSONALIZADA',
    clases: 1,
    nombre: '1 Clase Personalizada Mat-Funcional',
    descripcion: 'Una clase personalizada de Mat-Funcional'
  },
  {
    type: 'REFORMER',
    subtype: 'CLASE-NORMAL',
    clases: 1,
    nombre: '1 Clase Reformer',
    descripcion: 'Una clase individual de Reformer'
  },
  {
    type: 'REFORMER',
    subtype: 'CLASE-NORMAL',
    clases: 4,
    nombre: '4 Clases Reformer',
    descripcion: 'Bono de 4 clases de Reformer'
  },
  {
    type: 'REFORMER',
    subtype: 'CLASE-NORMAL',
    clases: 8,
    nombre: '8 Clases Reformer',
    descripcion: 'Bono de 8 clases de Reformer'
  },
  {
    type: 'REFORMER',
    subtype: 'CLASE-NORMAL',
    clases: 12,
    nombre: '12 Clases Reformer',
    descripcion: 'Bono de 12 clases de Reformer'
  },
  {
    type: 'REFORMER',
    subtype: 'CLASE-PERSONALIZADA',
    clases: 1,
    nombre: '1 Clase Personalizada Reformer',
    descripcion: 'Una clase personalizada de Reformer'
  }
];
