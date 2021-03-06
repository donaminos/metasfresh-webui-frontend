import counterpart from 'counterpart';
import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { push } from 'react-router-redux';
import { connect } from 'react-redux';

import {
    createViewRequest,
    browseViewRequest,
    filterViewRequest,
    deleteStaticFilter,
} from '../../actions/AppActions';
import {
    initLayout,
    getDataByIds,
} from '../../actions/GenericActions';
import {
    closeListIncludedView,
    setSorting,
    setPagination,
    setListId,
    setListIncludedView,
} from '../../actions/ListActions';
import {
    selectTableItems,
    getItemsByProperty,
    mapIncluded,
    indicatorState,
    connectWS,
    disconnectWS,
} from '../../actions/WindowActions';
import { getSelection } from '../../reducers/windowHandler';

import BlankPage from '../BlankPage';
import DataLayoutWrapper from '../DataLayoutWrapper';
import Filters from '../filters/Filters';
import FiltersStatic from '../filters/FiltersStatic';
import Table from '../table/Table';

import QuickActions from './QuickActions';
import SelectionAttributes from './SelectionAttributes';

const mapStateToProps = (state, props) => ({
    selected: getSelection({
        state,
        windowType: props.windowType,
        viewId: props.defaultViewId,
    }),
});

class DocumentList extends Component {
    static propTypes = {
        windowType: PropTypes.string.isRequired,
        dispatch: PropTypes.func.isRequired,
    }

    static contextTypes = {
        store: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);

        const { defaultViewId, defaultPage, defaultSort } = props;

        this.pageLength = 20;

        this.state = {
            data: null,
            layout: null,

            viewId: defaultViewId,
            page: defaultPage || 1,
            sort: defaultSort,
            filters: null,

            clickOutsideLock: false,

            isShowIncluded: false,
            hasShowIncluded: false
        };

        this.fetchLayoutAndData();
    }

    componentDidMount = () => {
        this.mounted = true;
    }

    componentDidUpdate(prevProps, prevState) {
        const { setModalDescription } = this.props;
        const { data } = this.state;

        if (prevState.data !== data && setModalDescription) {
            setModalDescription(data.description);
        }
    }

    componentWillUnmount() {
        this.mounted = false;
        disconnectWS.call(this);
    }

    componentWillReceiveProps(nextProps) {
        const {
            defaultPage: nextDefaultPage,
            defaultSort: nextDefaultSort,
            defaultViewId: nextDefaultViewId,
            includedView: nextIncludedView,
            isIncluded: nextIsIncluded,
            refId: nextRefId,
            windowType: nextWindowType,
        } = nextProps;

        const {
            defaultPage,
            defaultSort,
            defaultViewId,
            includedView,
            isIncluded,
            refId,
            windowType,
            dispatch,
        } = this.props;

        const {
            page,
            sort,
            viewId,
        } = this.state;

        const included = includedView && includedView.windowType &&
            includedView.viewId;
        const nextIncluded = nextIncludedView && nextIncludedView.windowType &&
            nextIncludedView.viewId;

        /*
         * If we browse list of docs, changing type of Document
         * does not re-construct component, so we need to
         * make it manually while the windowType changes.
         * OR
         * We want to refresh the window (generate new viewId)
         * OR
         * The reference ID is changed
         */
        if ((nextWindowType !== windowType) || (
                (nextDefaultViewId === undefined) &&
                (nextDefaultViewId !== defaultViewId)
            ) || (
                (nextWindowType === windowType) &&
                (nextDefaultViewId !== defaultViewId) &&
                isIncluded && nextIsIncluded
            ) || (nextRefId !== refId)
        ) {
            this.setState({
                data: null,
                layout: null,
                filters: null,
                viewId: null,
            }, () => {
                if (included) {
                    dispatch(closeListIncludedView(includedView));
                }

                this.fetchLayoutAndData();
            });
        }

        if ((nextDefaultSort !== defaultSort) &&
            (nextDefaultSort !== sort)
        ) {
            this.setState({ sort: nextDefaultSort });
        }

        if ((nextDefaultPage !== defaultPage) &&
            (nextDefaultPage !== page)
        ) {
            this.setState({ page: nextDefaultPage || 1 });
        }

        if ((nextDefaultViewId !== defaultViewId) &&
            (nextDefaultViewId !== viewId)
        ) {
            this.setState({ viewId: nextDefaultViewId });
        }

        if (included && !nextIncluded) {
            this.setState({ isShowIncluded: false, hasShowIncluded: false });
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        return !!nextState.layout && !!nextState.data;
    }

    connectWS = (viewId) => {
        const {windowType} = this.props;
        connectWS.call(this, '/view/' + viewId, (msg) => {
            const {fullyChanged, changedIds} = msg;
            if(changedIds){
                getDataByIds(
                    'documentView', windowType, viewId, changedIds.join()
                ).then(response => {
                    response.data.map(row => {
                        this.setState({
                            data: Object.assign(this.state.data, {}, {
                                result: this.state.data.result.map(
                                    resultRow =>
                                        resultRow.id === row.id ?
                                            row : resultRow
                                )
                            })
                        })
                    })
                });
            }

            if(fullyChanged == true){
                this.browseView();
                this.updateQuickActions();
            }
        });
    }

    updateQuickActions = () => {
        if (this.quickActionsComponent) {
            this.quickActionsComponent.updateActions();
        }
    }

    doesSelectionExist({ data, selected, hasIncluded = false } = {}) {
        // When the rows are changing we should ensure
        // that selection still exist

        if (hasIncluded) {
            return true;
        }

        let rows = [];

        data && data.result && data.result.map(item => {
            rows = rows.concat(mapIncluded(item));
        });

        return (data && data.size && data.result && selected && selected[0] &&
            getItemsByProperty(
                rows, 'id', selected[0]
            ).length
        );
    }

    getTableData = (data) => {
        return data;
    }

    redirectToNewDocument = () => {
        const {dispatch, windowType} = this.props;

        dispatch(push('/window/' + windowType + '/new'));
    }

    setClickOutsideLock = (value) => {
        this.setState({
            clickOutsideLock: !!value
        })
    }

    clearStaticFilters = (filterId) => {
        const {dispatch, windowType} = this.props;
        const {viewId} = this.state;

        deleteStaticFilter(windowType, viewId, filterId).then(response => {
            dispatch(push(
                '/window/' + windowType + '?viewId=' + response.data.viewId,
            ));
        });
    }

    // FETCHING LAYOUT && DATA -------------------------------------------------

    fetchLayoutAndData = (isNewFilter) => {
        const {
            windowType, type, setModalTitle, setNotFound
        } = this.props;

        const {
            viewId
        } = this.state;

        initLayout(
            'documentView', windowType, null, null, null, null, type, true
        ).then(response => {
            this.mounted && this.setState({
                layout: response.data
            }, () => {
                if(viewId && !isNewFilter){
                    this.browseView();
                }else{
                    if(viewId){
                        this.filterView();
                    } else {
                        this.createView();
                    }
                }
                setModalTitle && setModalTitle(response.data.caption)
            })
        }).catch(() => {
            // We have to always update that fields to refresh that view!
            // Check the shouldComponentUpdate method
            this.setState({
                data: 'notfound',
                layout: 'notfound'
            }, () => {
                setNotFound && setNotFound(true);
            })
        })
    }

    /*
     *  If viewId exist, than browse that view.
     */
    browseView = () => {
        const { viewId, page, sort } = this.state;

        this.getData(viewId, page, sort).catch((err) => {
            if (err.response && err.response.status === 404) {
                this.createView();
            }
        });
    }

    createView = () => {
        const {
            windowType, type, refType, refId, refTabId, refRowIds
        } = this.props;

        const {page, sort, filters} = this.state;

        createViewRequest(
            windowType, type, this.pageLength, filters, refType, refId,
            refTabId, refRowIds,
        ).then(response => {
            this.mounted && this.setState({
                data: response.data,
                viewId: response.data.viewId
            }, () => {
                this.getData(response.data.viewId, page, sort);
            })
        })
    }

    filterView = () => {
        const {
            windowType
        } = this.props;

        const {page, sort, filters, viewId} = this.state;

        filterViewRequest(
            windowType, viewId, filters
        ).then(response => {
            this.mounted && this.setState({
                data: response.data,
                viewId: response.data.viewId
            }, () => {
                this.getData(response.data.viewId, page, sort);
            })
        })
    }

    getData = (id, page, sortingQuery) => {
        const { store } = this.context;
        const {
            dispatch, windowType, updateUri, setNotFound, type, isIncluded,
        } = this.props;
        const { viewId } = this.state;

        if (setNotFound) {
            setNotFound(false);
        }
        dispatch(indicatorState('pending'));

        if (updateUri) {
            id && updateUri('viewId', id);
            page && updateUri('page', page);
            sortingQuery && updateUri('sort', sortingQuery);
        }

        return browseViewRequest(
            id, page, this.pageLength, sortingQuery, windowType
        ).then( (response) => {
            const selection = getSelection({
                state: store.getState(),
                windowType,
                viewId,
            });
            const forceSelection = (
                ((type === 'includedView') || isIncluded) &&
                response.data && response.data.result &&
                (response.data.result.length > 0) && (
                    (selection.length === 0 ) ||
                    !this.doesSelectionExist({
                        data: response.data,
                        selected: selection,
                    })
                )
            );

            if (this.mounted) {
                this.setState({
                    data: response.data,
                    filters: response.data.filters
                }, () => {
                    if (forceSelection && response.data &&
                        response.data.result
                    ) {
                        const selection = [response.data.result[0].id];

                        dispatch(selectTableItems({
                            windowType,
                            viewId,
                            ids: selection,
                        }));
                    }

                    this.connectWS(response.data.viewId);
                });
            }

            dispatch(indicatorState('saved'));
        });
    }

    // END OF FETCHING LAYOUT && DATA ------------------------------------------

    // MANAGING SORT, PAGINATION, FILTERS --------------------------------------

    handleChangePage = (index) => {
        const {data, sort, page, viewId} = this.state;

        let currentPage = page;

        switch(index){
            case 'up':
                currentPage * data.pageLength < data.size ?
                    currentPage++ : null;
                break;
            case 'down':
                currentPage != 1 ? currentPage-- : null;
                break;
            default:
                currentPage = index;
        }

        this.setState({
            page: currentPage
        }, () => {
            this.getData(viewId, currentPage, sort);
        });
    }

    getSortingQuery = (asc, field) => (asc ? '+' : '-') + field;

    sortData = (asc, field, startPage) => {
        const {viewId, page} = this.state;

        this.setState({
            sort: this.getSortingQuery(asc, field)
        }, () => {
            this.getData(
                viewId, startPage ? 1 : page, this.getSortingQuery(asc, field)
            );
        });
    }

    handleFilterChange = (filters) => {
        this.setState({
            filters: filters,
            page: 1
        }, () => {
            this.fetchLayoutAndData(true);
        })
    }

    // END OF MANAGING SORT, PAGINATION, FILTERS -------------------------------

    redirectToDocument = (id) => {
        const {
            dispatch, isModal, windowType, isSideListShow
        } = this.props;
        const {page, viewId, sort} = this.state;

        if (isModal) {
            return;
        }

        dispatch(push('/window/' + windowType + '/' + id));

        if (!isSideListShow) {
            // Caching last settings
            dispatch(setPagination(page, windowType));
            dispatch(setSorting(sort, windowType));
            dispatch(setListId(viewId, windowType));
        }
    }

    showIncludedViewOnSelect = ({
        showIncludedView, windowType, viewId, forceClose,
    } = {}) => {
        const { dispatch } = this.props;

        this.setState({
            isShowIncluded: !!showIncludedView,
            hasShowIncluded: !!showIncludedView,
        }, () => {
            if (showIncludedView) {
                dispatch(setListIncludedView({ windowType, viewId }));
            }
        });

        // can't use setState callback because component might be unmounted and
        // callback is never called
        if (!showIncludedView) {
            dispatch(closeListIncludedView({ windowType, viewId, forceClose }));
        }
    }

    render() {
        const {
            windowType, open, closeOverlays, selected, inBackground,
            fetchQuickActionsOnInit, isModal, processStatus, readonly,
            includedView, isIncluded, disablePaginationShortcuts,
            notfound, disconnectFromState, autofocus, inModal,
        } = this.props;
        const {
            layout, data, viewId, clickOutsideLock, page, filters,
            isShowIncluded, hasShowIncluded, refreshSelection,
        } = this.state;

        const hasIncluded = layout && layout.includedView && includedView &&
            includedView.windowType && includedView.viewId;
        const selectionValid = this.doesSelectionExist({
            data, selected, hasIncluded,
        });
        const blurWhenOpen = layout && layout.includedView &&
            layout.includedView.blurWhenOpen;

        if (notfound || layout === 'notfound' || data === 'notfound') {
            return (
                <BlankPage
                    what={counterpart.translate('view.error.windowName')}
                />
            );
        }

        let showQuickActions = true;
        if (isModal && !inBackground && !selectionValid) {
            showQuickActions = false;
        }

        if (layout && data) {
            return (
                <div
                    className={
                        'document-list-wrapper ' +
                        ((isShowIncluded || isIncluded) ?
                            'document-list-included ' : '') +
                        ((hasShowIncluded || hasIncluded) ?
                            'document-list-has-included ' : '')
                    }
                >
                        {!readonly && <div
                            className="panel panel-primary panel-spaced panel-inline document-list-header"
                        >
                            <div className={hasIncluded ? 'disabled' : ''}>
                                {layout.supportNewRecord && !isModal && (
                                    <button
                                        className="btn btn-meta-outline-secondary btn-distance btn-sm hidden-sm-down btn-new-document"
                                        onClick={() =>
                                            this.redirectToNewDocument()}
                                        title={layout.newRecordCaption}
                                    >
                                        <i className="meta-icon-add" />
                                        {layout.newRecordCaption}
                                    </button>
                                )}

                                {layout.filters && (
                                    <Filters
                                        {...{windowType, viewId}}
                                        filterData={layout.filters}
                                        filtersActive={filters}
                                        updateDocList={this.handleFilterChange}
                                    />
                                )}

                                {data.staticFilters && (
                                    <FiltersStatic
                                        {...{windowType, viewId}}
                                        data={data.staticFilters}
                                        clearFilters={this.clearStaticFilters}
                                    />
                                )}
                            </div>

                            {showQuickActions && (
                                <QuickActions
                                    processStatus={processStatus}
                                    ref={ (c) => {
                                        this.quickActionsComponent = (
                                            c && c.getWrappedInstance()
                                        );
                                    }}
                                    selected={selected}
                                    viewId={viewId}
                                    windowType={windowType}
                                    fetchOnInit={fetchQuickActionsOnInit}
                                    disabled={hasIncluded && blurWhenOpen}
                                    shouldNotUpdate={
                                        inBackground && !hasIncluded
                                    }
                                    inBackground={disablePaginationShortcuts}
                                    inModal={inModal}
                                />
                            )}
                        </div>}
                        <div className="document-list-body">
                            <Table
                                entity="documentView"
                                ref={c => this.table =
                                    c && c.getWrappedInstance()
                                    && c.getWrappedInstance().refs.instance
                                }
                                rowData={{1: data.result}}
                                cols={layout.elements}
                                collapsible={layout.collapsible}
                                expandedDepth={layout.expandedDepth}
                                tabid={1}
                                type={windowType}
                                emptyText={layout.emptyResultText}
                                emptyHint={layout.emptyResultHint}
                                readonly={true}
                                keyProperty="id"
                                onDoubleClick={(id) =>
                                        !isIncluded &&
                                            this.redirectToDocument(id)}
                                size={data.size}
                                pageLength={this.pageLength}
                                handleChangePage={this.handleChangePage}
                                mainTable={true}
                                updateDocList={this.fetchLayoutAndData}
                                sort={this.sortData}
                                orderBy={data.orderBy}
                                tabIndex={0}
                                indentSupported={layout.supportTree}
                                disableOnClickOutside={clickOutsideLock}
                                defaultSelected={selected}
                                refreshSelection={refreshSelection}
                                queryLimitHit={data.queryLimitHit}
                                showIncludedViewOnSelect={
                                    this.showIncludedViewOnSelect
                                }
                                openIncludedViewOnSelect={
                                    layout.includedView &&
                                    layout.includedView.openOnSelect
                                }
                                blurOnIncludedView={blurWhenOpen}
                                {...{isIncluded, disconnectFromState, autofocus,
                                    open, page, closeOverlays, inBackground,
                                    disablePaginationShortcuts, isModal,
                                    hasIncluded, viewId, windowType,
                                }}
                            >
                                {layout.supportAttributes && !isIncluded &&
                                    !hasIncluded &&
                                    <DataLayoutWrapper
                                        className="table-flex-wrapper attributes-selector js-not-unselect"
                                        entity="documentView"
                                        {...{windowType, viewId}}
                                    >
                                        <SelectionAttributes
                                            setClickOutsideLock={
                                                this.setClickOutsideLock
                                            }
                                            selected={selectionValid ?
                                                selected : undefined
                                            }
                                            shouldNotUpdate={
                                                inBackground
                                            }
                                        />
                                    </DataLayoutWrapper>
                                }
                            </Table>
                        </div>
                </div>
            );
        }else{
            return false;
        }

    }
}

export default connect(
  mapStateToProps, null, null, { withRef: true },
)(DocumentList);
