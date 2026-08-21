import type { Scene } from './types.js';

/**
 * Cenas em teste. DEVE espelhar src/content/figures/patriota.ts — se as duas
 * listas divergirem, o spike passa a medir uma coisa e o produto a vender outra.
 *
 * Resultado da rodada de 2026-08-11 (47 imagens pontuadas, rota d-seedream),
 * considerando apenas as selfies de boa qualidade:
 *
 *   comicio        2/2   mantida
 *   selfie-rua     2/2   mantida
 *   moto           2/2   mantida
 *   gabinete       1/2   cortada (marginal)
 *   aperto-de-mao  0/2   cortada — falha ate com a melhor entrada
 *   churrasco      0/2   cortada — idem
 *
 * O padrao das que sobrevivem: os dois EM PE, LADO A LADO, AO AR LIVRE.
 * O Seedream preserva a roupa da selfie, entao cena que exige terno ou pose de
 * interacao especifica (aperto de mao, sentado) briga contra o modelo.
 */
export const scenes: Scene[] = [
  {
    id: 'selfie-rua',
    label: 'Selfie na rua',
    aspectRatio: '3:4',
    setting:
      'a casual smartphone selfie taken outdoors on a sunny Brazilian street, both people ' +
      'smiling at the camera, shoulders close together, slight wide-angle lens distortion, ' +
      'natural midday light, candid amateur photo look',
    plateFile: 'selfie-rua.jpg',
  },
  {
    id: 'comicio',
    label: 'Comício com bandeiras',
    aspectRatio: '16:9',
    setting:
      'two people standing side by side on an outdoor stage in front of a large cheering ' +
      'crowd waving green and yellow Brazilian flags, golden hour backlight, ' +
      'photojournalistic wide shot',
    plateFile: 'comicio.jpg',
  },
  {
    id: 'moto',
    label: 'Motociata',
    aspectRatio: '16:9',
    setting:
      'two people standing side by side next to motorcycles on a highway during a large ' +
      'motorcycle rally, helmets off, Brazilian flags on the bikes, other riders blurred ' +
      'in the background, bright overcast daylight',
    plateFile: 'moto.jpg',
  },

  // --- Candidatas ainda NAO validadas: variacoes da forma vencedora.
  {
    id: 'estadio',
    label: 'No estádio',
    aspectRatio: '16:9',
    setting:
      'two people standing side by side in the stands of a packed football stadium on a ' +
      'sunny afternoon, crowd out of focus behind them, both looking at the camera, ' +
      'casual clothes, natural daylight, phone photo look',
    plateFile: 'estadio.jpg',
  },
  {
    id: 'feira',
    label: 'Na feira',
    aspectRatio: '3:4',
    setting:
      'two people standing side by side in a busy Brazilian street market on a sunny ' +
      'morning, stalls and people out of focus behind them, both smiling at the camera, ' +
      'casual clothes, warm natural light, candid phone photo',
    plateFile: 'feira.jpg',
  },
];

export const sceneById = (id: string) => scenes.find((s) => s.id === id);
