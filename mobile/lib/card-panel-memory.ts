const cardPanelMemory = new Map<string, number>();

export function getSavedCardPanel(cardKey: string): number {
  return cardPanelMemory.get(cardKey) ?? 0;
}

export function setSavedCardPanel(cardKey: string, panel: number): void {
  cardPanelMemory.set(cardKey, panel);
}
