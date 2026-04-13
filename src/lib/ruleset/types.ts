export type RulesetCondition = {
    ref_name: {
        exclude: string[];
        include: string[];
    };
};

export type RulesetBypassActor = {
    actor_id: null | number;
    actor_type: string;
    bypass_mode: string;
};

export type RulesetRule = {
    parameters?: Record<string, unknown>;
    type: string;
};

export type RulesetSummary = {
    id: number;
};

export type RulesetDefinition = {
    bypass_actors: RulesetBypassActor[];
    conditions: RulesetCondition;
    enforcement: string;
    name: string;
    rules: RulesetRule[];
    target: string;
};

export type RulesetDetail = {
    id: number;
} & RulesetDefinition;

function isStringArray(value: unknown): value is string[] {
    return (
        Array.isArray(value) &&
        value.every((item): item is string => typeof item === 'string')
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isRulesetCondition(value: unknown): value is RulesetCondition {
    if (isRecord(value) === false) {
        return false;
    }

    const refName = value.ref_name;

    return (
        isRecord(refName) &&
        isStringArray(refName.exclude) &&
        isStringArray(refName.include)
    );
}

function isRulesetBypassActor(value: unknown): value is RulesetBypassActor {
    return (
        isRecord(value) &&
        (typeof value.actor_id === 'number' || value.actor_id === null) &&
        typeof value.actor_type === 'string' &&
        typeof value.bypass_mode === 'string'
    );
}

function isRulesetRule(value: unknown): value is RulesetRule {
    return (
        isRecord(value) &&
        typeof value.type === 'string' &&
        (value.parameters === undefined || isRecord(value.parameters))
    );
}

export function isRulesetSummary(value: unknown): value is RulesetSummary {
    return isRecord(value) && typeof value.id === 'number';
}

export function isRulesetDefinition(
    value: unknown,
): value is RulesetDefinition {
    return (
        isRecord(value) &&
        typeof value.name === 'string' &&
        typeof value.target === 'string' &&
        typeof value.enforcement === 'string' &&
        Array.isArray(value.bypass_actors) &&
        value.bypass_actors.every(isRulesetBypassActor) &&
        isRulesetCondition(value.conditions) &&
        Array.isArray(value.rules) &&
        value.rules.every(isRulesetRule)
    );
}

export function isRulesetDetail(value: unknown): value is RulesetDetail {
    if (isRecord(value) === false || typeof value.id !== 'number') {
        return false;
    }

    return isRulesetDefinition(value);
}
