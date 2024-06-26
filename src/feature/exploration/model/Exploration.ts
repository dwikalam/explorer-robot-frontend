export interface IExplorationByIdRetDto {
    id: string,
    name: string,
}

export interface IExplorationsRetDto {
    explorationsData: IExplorationByIdRetDto[],
}

export interface ICreateExplorationArgDto {
    name: string,
}

export interface ICreateExplorationRetDto {
    message: string,
    explorationId: string,
}