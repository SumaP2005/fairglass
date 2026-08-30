import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  getInitialPolicyHash(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getCandidateMetrics(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { idCommitment: Uint8Array,
                                                                                    skillsScore: bigint,
                                                                                    experienceYears: bigint,
                                                                                    usedForbiddenData: boolean
                                                                                  }];
  getCurrentTimestamp(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
}

export type ImpureCircuits<PS> = {
  submitDecision(context: __compactRuntime.CircuitContext<PS>,
                 decision_0: boolean): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  submitDecision(context: __compactRuntime.CircuitContext<PS>,
                 decision_0: boolean): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  submitDecision(context: __compactRuntime.CircuitContext<PS>,
                 decision_0: boolean): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly activePolicyHash: Uint8Array;
  receipts: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { policyHash: Uint8Array,
                                 decision: boolean,
                                 timestamp: bigint
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { policyHash: Uint8Array, decision: boolean, timestamp: bigint }]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
