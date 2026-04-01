import perfectionist from 'eslint-plugin-perfectionist';

type GroupList = unknown[];
type SortClassesRuleLike = {
    defaultOptions?: Array<{
        groups?: GroupList;
    }>;
};

const RENDER_GROUP = 'render-method';
const RENDER_GROUPS = [
    {
        elementNamePattern: '^render$',
        groupName: RENDER_GROUP,
        selector: 'method',
    },
];

export function getClassMemberSortConfig(): {
    customGroups: typeof RENDER_GROUPS;
    fallbackSort: { type: 'unsorted' };
    groups: GroupList;
    ignoreCase: true;
    order: 'asc';
    type: 'alphabetical';
} {
    return {
        customGroups: RENDER_GROUPS,
        fallbackSort: { type: 'unsorted' },
        groups: buildRenderLastClassGroups(),
        ignoreCase: true,
        order: 'asc',
        type: 'alphabetical',
    };
}

function buildRenderLastClassGroups(): GroupList {
    try {
        const sortClassesRule = perfectionist.rules?.['sort-classes'];
        if (hasDefaultOptions(sortClassesRule) === false) {
            return [RENDER_GROUP];
        }
        const baseGroups = sortClassesRule.defaultOptions?.[0]?.groups ?? [];
        return insertRenderGroup(baseGroups);
    } catch {
        return [RENDER_GROUP];
    }
}

function hasDefaultOptions(value: unknown): value is SortClassesRuleLike {
    return (
        typeof value === 'object' && value !== null && 'defaultOptions' in value
    );
}

function insertRenderGroup(groups: unknown): GroupList {
    if (!Array.isArray(groups)) {
        return [RENDER_GROUP];
    }

    const index = groups.lastIndexOf('unknown');
    if (index === -1) {
        return [...groups, RENDER_GROUP];
    }

    return [...groups.slice(0, index), RENDER_GROUP, ...groups.slice(index)];
}
