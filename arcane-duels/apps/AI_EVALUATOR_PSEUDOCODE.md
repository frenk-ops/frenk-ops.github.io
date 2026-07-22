# Valutatore IA recuperato — pseudocodice v0.15

Questo documento descrive la traduzione attualmente implementata. I nomi semantici sono nostri; indirizzi, dimensioni e costanti derivano dall’eseguibile originale.

```text
BestMove(side, difficulty):
    snapshot = copyDuelState(0x35 DWORD)
    scores = int[5 schools][13 cards][5 lanes]

    for school in 1..5:
        for card in 1..13:
            for lane in 1..5:
                restore(snapshot)
                if moveIsLegal(school, card, lane):
                    applyMove(school, card, lane)
                    resolveAttackPhase()

                    if difficulty == Archmage:
                        simulateTwoFurtherAttackPhases()
                    else:
                        simulateOneFurtherAttackPhase()

                    selfValue = EvaluateSide(self, difficulty)
                    enemyValue = EvaluateSide(enemy, difficulty)
                    scores[school][card][lane] = selfValue - enemyValue

    restore(snapshot)
    return coordinatesOfMaximum(scores), or pass
```

```text
EvaluateSide(side, difficulty):
    value = LifeCurve(side.life) * 65

    if difficulty == Novice:
        distort current side and opponent asymmetrically

    for each elemental school:
        value += currentPower * powerWeight * 10

        if difficulty == Archmage:
            penalize power exceeding useful cards in hand
            value += nonlinear contribution of power growth

    value += specializationPowerBonus

    for each creature on board:
        attackFactor = effectiveAttack * 10
        healthFactor = currentHealth * 10
        compress health above 30
        healthFactor += maxHealth * 10 / 4
        apply duplicate rules
        apply known card-specific rules
        apply multi-target multiplier
        apply ability and persistent-power values
        value += directBonus + healthFactor * attackFactor

    if difficulty < Archmage:
        value *= difficultyRandomFactor()

    return value
```

## Nota sul rumore

Il fattore casuale viene applicato durante la valutazione dei lati, non semplicemente scegliendo a caso tra le migliori mosse. Questo può cambiare l’ordine relativo dei candidati e produce il comportamento meno coerente dei maghi inferiori.
