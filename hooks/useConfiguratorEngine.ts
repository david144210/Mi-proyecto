import { useState } from 'react';

export type TipoSeccion = 'espacio' | 'cajon' | 'puerta' | 'repisa';

export interface SeccionData {
  id: number;
  tipo: TipoSeccion;
  alturaCm: number;
}

export interface ColumnaData {
  id: number;
  anchoCm: number;
  secciones: SeccionData[];
}

export const useConfiguratorEngine = () => {
  const [columnas, setColumnas] = useState<ColumnaData[]>([
    { 
      id: 1, 
      anchoCm: 70, 
      secciones: [
        { id: 1, tipo: 'espacio', alturaCm: 80 },
        { id: 2, tipo: 'cajon', alturaCm: 40 }
      ] 
    }
  ]);

  // Agregar una nueva columna al mueble
  const addColumna = () => {
    const nuevoId = columnas.length > 0 ? Math.max(...columnas.map(c => c.id)) + 1 : 1;
    setColumnas(prev => [
      ...prev, 
      { id: nuevoId, anchoCm: 70, secciones: [{ id: Date.now(), tipo: 'espacio', alturaCm: 100 }] }
    ]);
  };

  // Eliminar una columna (siempre que quede al menos una)
  const removeColumna = (colId: number) => {
    if (columnas.length <= 1) return;
    setColumnas(prev => prev.filter(c => c.id !== colId));
  };

  // Añadir una sección dentro de una columna específica
  const addSeccion = (colId: number, tipo: TipoSeccion = 'espacio') => {
    setColumnas(prev => prev.map(col => {
      if (col.id !== colId) return col;
      const nuevoSecId = col.secciones.length > 0 ? Math.max(...col.secciones.map(s => s.id)) + 1 : 1;
      return {
        ...col,
        secciones: [...col.secciones, { id: nuevoSecId, tipo, alturaCm: 50 }]
      };
    }));
  };

  // Eliminar una sección de una columna
  const removeSeccion = (colId: number, secId: number) => {
    setColumnas(prev => prev.map(col => {
      if (col.id !== colId) return col;
      if (col.secciones.length <= 1) return col; // Evitar dejar la columna sin secciones
      return {
        ...col,
        secciones: col.secciones.filter(sec => sec.id !== secId)
      };
    }));
  };

  // Actualizar propiedades de una sección (tipo, altura, etc.)
  const updateSeccion = (colId: number, secId: number, tipo: TipoSeccion) => {
    setColumnas(prev => prev.map(col => {
      if (col.id !== colId) return col;
      return {
        ...col,
        secciones: col.secciones.map(sec => 
          sec.id === secId ? { ...sec, tipo } : sec
        )
      };
    }));
  };

  // Cambiar el ancho de una columna
  const updateAnchoColumna = (colId: number, anchoCm: number) => {
    setColumnas(prev => prev.map(col => col.id === colId ? { ...col, anchoCm } : col));
  };

  return { 
    columnas, 
    addColumna, 
    removeColumna, 
    addSeccion, 
    removeSeccion, 
    updateSeccion, 
    updateAnchoColumna 
  };
};