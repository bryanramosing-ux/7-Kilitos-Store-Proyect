// Estados comerciales. Las transiciones replican functions/src/orders.js para
// mostrar solo acciones válidas; el servidor vuelve a validarlas siempre.
export const ORDER_STATUS = Object.freeze({
  pendiente: { label: 'Pendiente', icon: 'schedule', description: 'Recibido, a la espera de confirmación de la tienda.' },
  confirmado: { label: 'Confirmado', icon: 'thumb_up', description: 'La tienda confirmó el pedido y espera el pago.' },
  pagado: { label: 'Pagado', icon: 'paid', description: 'Pago recibido. Es una venta confirmada.' },
  entregado: { label: 'Entregado', icon: 'inventory_2', description: 'El pedido fue entregado.' },
  cancelado: { label: 'Cancelado', icon: 'cancel', description: 'El pedido fue cancelado y su stock devuelto.' },
});

export const TRANSITIONS = Object.freeze({
  pendiente: ['confirmado', 'pagado', 'cancelado'],
  confirmado: ['pagado', 'cancelado'],
  pagado: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: [],
});

export function allowedTransitions(status, role) {
  return (TRANSITIONS[status] ?? []).filter((next) => !(status === 'pagado' && next === 'cancelado' && role !== 'admin'));
}

export const TRANSITION_ACTIONS = Object.freeze({
  confirmado: { label: 'Confirmar pedido', icon: 'thumb_up', tone: 'btn-secondary' },
  pagado: { label: 'Registrar pago', icon: 'paid', tone: 'btn-brand' },
  entregado: { label: 'Marcar entregado', icon: 'inventory_2', tone: 'btn-plum' },
  cancelado: { label: 'Cancelar pedido', icon: 'cancel', tone: 'btn-danger-soft' },
});

export const SALE_STATUS = Object.freeze({
  vigente: { label: 'Vigente', icon: 'verified' },
  anulada: { label: 'Anulada', icon: 'block' },
});

export const MOVEMENT_TYPES = Object.freeze({
  entrada: { label: 'Entrada', icon: 'add_box' },
  salida: { label: 'Salida', icon: 'indeterminate_check_box' },
  ajuste: { label: 'Ajuste por conteo', icon: 'tune' },
  stock_inicial: { label: 'Stock inicial', icon: 'inventory' },
  reserva_pedido: { label: 'Reserva por pedido', icon: 'shopping_bag' },
  devolucion_cancelacion: { label: 'Devolución por cancelación', icon: 'undo' },
});

export const ROLE_LABELS = Object.freeze({ admin: 'Administración', encargado: 'Encargado/a', cliente: 'Cliente' });
