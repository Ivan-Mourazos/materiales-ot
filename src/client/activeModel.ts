import type { ActiveModel, AssignmentModel } from './types';

type ModelLoad = {
  multiplier: number;
  partsLoaded: number;
  appendedToOtherOfs: boolean;
};

/**
 * Recuerda de qué modelo viene el formulario y si se puede actualizar.
 * Las trampas son de la CARGA: lo que se edite después sí se quiere guardar.
 */
export function describeActiveModel(
  model: Pick<AssignmentModel, 'id' | 'name' | 'description' | 'createdAt' | 'updatedAt' | 'parts'>,
  load: ModelLoad
): ActiveModel {
  const reason =
    load.multiplier !== 1
      ? `Lo cargaste ×${String(load.multiplier).replace('.', ',')}: se guardarían las cantidades multiplicadas como base.`
      : load.partsLoaded < model.parts.length
        ? `Cargaste ${load.partsLoaded} de ${model.parts.length} partes: el modelo perdería las demás.`
        : load.appendedToOtherOfs
          ? 'Lo añadiste encima de otras OFs: el modelo se quedaría con OFs ajenas.'
          : null;

  return {
    id: model.id,
    name: model.name,
    description: model.description || '',
    updatedAt: model.updatedAt || model.createdAt,
    updatable: reason === null,
    reason
  };
}
